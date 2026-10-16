// Custom event type names are unique per creator, not instance-wide: one
// user's "Graduation" must not block another user's.
const mongoose = require('mongoose');
const { teardownTestDB } = require('../utils/testSetup');

jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const EventType = require('../../models/EventType');
const Holiday = require('../../models/Holiday');
const dbInitializer = require('../../utils/dbInitializer');
const eventTypeController = require('../../controllers/eventTypeController');

const MONGO_URI = `mongodb://localhost:27017/gifty-test-eventtype-unique-${process.pid}`;
const oid = () => new mongoose.Types.ObjectId();

describe('EventType names are unique per creator', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    await mongoose.connect(MONGO_URI);
    await EventType.init();
  });

  beforeEach(async () => {
    await Promise.all([EventType.deleteMany({}), Holiday.deleteMany({})]);
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  it('lets two users each own a custom type with the same name', async () => {
    await EventType.create({ name: 'Graduation', isCustom: true, createdBy: oid() });
    await expect(EventType.create({ name: 'Graduation', isCustom: true, createdBy: oid() })).resolves.toBeDefined();
  });

  it('rejects the same custom name twice for one user', async () => {
    const user = oid();
    await EventType.create({ name: 'Graduation', isCustom: true, createdBy: user });
    await expect(EventType.create({ name: 'Graduation', isCustom: true, createdBy: user }))
      .rejects.toMatchObject({ code: 11000 });
  });

  it("lets a user name a custom type like a system type", async () => {
    await EventType.create({ name: 'Birthday', isCustom: false });
    await expect(EventType.create({ name: 'Birthday', isCustom: true, createdBy: oid() })).resolves.toBeDefined();
  });

  it('keeps system type names unique', async () => {
    await EventType.create({ name: 'Christmas', isCustom: false });
    await expect(EventType.create({ name: 'Christmas', isCustom: false })).rejects.toMatchObject({ code: 11000 });
  });

  it('has no global unique index on name', async () => {
    const indexes = await EventType.collection.indexes();
    expect(indexes.find((i) => i.name === 'name_1')).toBeUndefined();
    expect(indexes.find((i) => i.name === 'creator_name_unique')).toMatchObject({
      key: { createdBy: 1, name: 1 }, unique: true
    });
  });

  it("seeding never adopts or rewrites a user's custom type of the same name", async () => {
    const user = oid();
    const customHoliday = await EventType.create({ name: 'Holiday', isCustom: true, createdBy: user });
    const customBirthday = await EventType.create({ name: 'Birthday', isCustom: true, createdBy: user });

    await dbInitializer.seedEventTypes(); // types exist → only re-flags system types
    expect((await EventType.findById(customBirthday._id).lean()).isCustom).toBe(true);

    await dbInitializer.seedHolidays();
    const holiday = await Holiday.findOne().lean();
    expect(String(holiday.eventType)).not.toBe(String(customHoliday._id));
    const systemHoliday = await EventType.findOne({ name: 'Holiday', createdBy: null }).lean();
    expect(String(holiday.eventType)).toBe(String(systemHoliday._id));
  });

  describe('the API answers a same-user duplicate name with 409 and no driver text', () => {
    const call = async (handler, { body, params = {}, user }) => {
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
      await handler({ body, params, user: { _id: user } }, res);
      return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
    };

    it('on create', async () => {
      const user = oid();
      await EventType.create({ name: 'Graduation', isCustom: true, createdBy: user });
      const { status, body } = await call(eventTypeController.createEventType, { body: { name: 'Graduation' }, user });
      expect(status).toBe(409);
      expect(body).toEqual({ message: 'You already have an event type named Graduation' });
    });

    it('on rename', async () => {
      const user = oid();
      await EventType.create({ name: 'Graduation', isCustom: true, createdBy: user });
      const other = await EventType.create({ name: 'Retirement', isCustom: true, createdBy: user });
      const { status, body } = await call(eventTypeController.updateEventType, {
        body: { name: 'Graduation' }, params: { eventTypeID: String(other._id) }, user
      });
      expect(status).toBe(409);
      expect(body).toEqual({ message: 'You already have an event type named Graduation' });
      expect((await EventType.findById(other._id).lean()).name).toBe('Retirement');
    });
  });

  describe('names are checked on rename as on create', () => {
    const call = async (handler, { body, params = {}, user }) => {
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
      await handler({ body, params, user: { _id: user } }, res);
      return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
    };

    it.each([['an empty name', ''], ['no name', null], ['a blank name', '   '], ['a name over 50 characters', 'x'.repeat(51)]])(
      'refuses %s and keeps the old one', async (label, name) => {
        const user = oid();
        const type = await EventType.create({ name: 'Retirement', isCustom: true, createdBy: user });
        const { status } = await call(eventTypeController.updateEventType, {
          body: { name }, params: { eventTypeID: String(type._id) }, user
        });
        expect(status).toBe(400);
        expect((await EventType.findById(type._id).lean()).name).toBe('Retirement');
      });

    it('refuses a blank or overlong name on create', async () => {
      const user = oid();
      expect((await call(eventTypeController.createEventType, { body: { name: '   ' }, user })).status).toBe(400);
      const overlong = await call(eventTypeController.createEventType, { body: { name: 'x'.repeat(51) }, user });
      expect(overlong).toEqual({ status: 400, body: { message: 'Event type names can be at most 50 characters' } });
    });

    it('trims names, so a trailing space is not a second type', async () => {
      const user = oid();
      await call(eventTypeController.createEventType, { body: { name: 'Anniversary ' }, user });
      const { status } = await call(eventTypeController.createEventType, { body: { name: 'Anniversary' }, user });
      expect(status).toBe(409);
      expect(await EventType.find({ createdBy: user }).lean()).toEqual([expect.objectContaining({ name: 'Anniversary' })]);
    });

    it('a description-only change keeps the name', async () => {
      const user = oid();
      const type = await EventType.create({ name: 'Retirement', isCustom: true, createdBy: user });
      const { status, body } = await call(eventTypeController.updateEventType, {
        body: { description: 'Work friends' }, params: { eventTypeID: String(type._id) }, user
      });
      expect(status).toBe(200);
      expect(body).toMatchObject({ name: 'Retirement', description: 'Work friends' });
    });
  });
});
