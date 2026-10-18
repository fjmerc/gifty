// An app with the account and admin routes over the real auth cookies, for
// the 1b admin tests. Each test file connects to its own database.
const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const User = require('../../models/User');

const PASSWORD = 'Passw0rd!x';

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/users', require('../../routes/userRoutes'));
  app.use('/api/admin', require('../../routes/adminRoutes'));
  app.use(require('../../middleware/errorHandler'));
  return app;
};

// A signed-in agent for a new account
const signUp = async (app, name, extra = {}) => {
  const agent = request.agent(app);
  await agent.post('/api/users/register').send({
    username: name, email: `${name}@example.com`, password: PASSWORD, firstName: name, lastName: 'L', ...extra
  }).expect(201);
  return agent;
};

const idOf = async (name) => String((await User.findOne({ username: name }))._id);

module.exports = { buildApp, signUp, idOf, PASSWORD };
