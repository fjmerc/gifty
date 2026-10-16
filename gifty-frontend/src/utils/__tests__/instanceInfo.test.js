import axiosInstance from '../../axiosInstance';
import { fetchInstanceInfo, resetInstanceInfoCache } from '../instanceInfo';

jest.mock('../../axiosInstance', () => ({ get: jest.fn() }));

describe('fetchInstanceInfo', () => {
  beforeEach(() => { resetInstanceInfoCache(); axiosInstance.get.mockReset(); });

  it('fetches once and memoizes', async () => {
    axiosInstance.get.mockResolvedValue({ data: { version: '0.9.0', features: { ai: false, email: false, webSearch: false } } });
    const a = await fetchInstanceInfo();
    const b = await fetchInstanceInfo();
    expect(a.features.ai).toBe(false);
    expect(b).toBe(a);
    expect(axiosInstance.get).toHaveBeenCalledTimes(1);
    expect(axiosInstance.get).toHaveBeenCalledWith('/instance');
  });

  it('fails open so a network blip does not hide features', async () => {
    axiosInstance.get.mockRejectedValue(new Error('Network Error'));
    const info = await fetchInstanceInfo();
    expect(info.features).toEqual({ ai: true, email: true, webSearch: true });
  });
});

describe('fetchInstanceInfo with a misbehaving client', () => {
  beforeEach(() => { resetInstanceInfoCache(); axiosInstance.get.mockReset(); });

  it('falls back instead of throwing when get() returns nothing (e.g. an unconfigured mock)', async () => {
    axiosInstance.get.mockReturnValue(undefined);
    await expect(fetchInstanceInfo()).resolves.toEqual({ version: 'unknown', features: { ai: true, email: true, webSearch: true } });
  });
});
