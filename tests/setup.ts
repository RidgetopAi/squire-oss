/**
 * Test setup — seeds dummy values for required env vars so unit tests
 * can import modules that transitively touch src/config/index.ts.
 *
 * This file is imported FIRST from each test that needs it. It does not
 * configure the test runner; it just sets process.env defaults so a
 * `import { ... } from '../src/...'` doesn't blow up demanding
 * production credentials.
 *
 * Tests that do need real config should override these explicitly.
 */

process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test_db';
process.env.NODE_ENV ??= 'test';
process.env.PERSONA_FILE ??= './prompts/persona.example.md';
process.env.USER_NAME ??= 'TestUser';
