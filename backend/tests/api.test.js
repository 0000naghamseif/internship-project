const request = require('supertest');
const app = require('../src/app');
const path = require('path');
const pool = require("backend/src/config/db");

describe('Basic API Tests', () => {
  test('GET / should return backend working message', async () => {
    const res = await request(app).get('/');

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Backend is working');
  });

  test('GET /files without token should return 401', async () => {
    const res = await request(app).get('/files');

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe('No token provided');
  });
});

describe('Authentication', () => {
  test('Login with invalid credentials should fail', async () => {
    const res = await request(app).post('/auth/login').send({
      username: 'wronguser',
      password: 'wrongpassword',
    });

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe('Invalid username or password');
  });
});

afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 500));
});

describe('Upload API', () => {
  test('Upload PDF should succeed', async () => {
    // Login
    const loginRes = await request(app).post('/auth/login').send({
      username: 'israa',
      password: '123456i',
    });

    expect(loginRes.statusCode).toBe(200);

    const token = loginRes.body.token;

    // Upload
    const uploadRes = await request(app)
      .post('/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', path.join(__dirname, '../uploads/sample.pdf'));

    expect(uploadRes.statusCode).toBe(200);
    expect(uploadRes.body.message).toContain('queued');
  });
});

test('Uploaded file should appear in documents list', async () => {
  // Login
  const loginRes = await request(app).post('/auth/login').send({
    username: 'israa',
    password: '123456i',
  });

  const token = loginRes.body.token;

  // Get documents
  const res = await request(app)
    .get('/files')
    .set('Authorization', `Bearer ${token}`);

  expect(res.statusCode).toBe(200);

  const exists = res.body.some((doc) => doc.originalName === 'sample.pdf');

  expect(exists).toBe(true);
});

test('Viewer should not be allowed to upload', async () => {
  // Login as Viewer
  const loginRes = await request(app).post('/auth/login').send({
    username: 'maya',
    password: '123456x',
  });

  expect(loginRes.statusCode).toBe(200);

  const token = loginRes.body.token;

  // Try upload
  const uploadRes = await request(app)
    .post('/upload')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', path.join(__dirname, '../uploads/sample.pdf'));

  expect(uploadRes.statusCode).toBe(403);
  expect(uploadRes.body.message).toBeDefined();
});



let server;
beforeAll(() => {
  server = app.listen(0);
});
afterAll(async () => {
  await pool.end();
  await new Promise((resolve) => server.close(resolve));
});