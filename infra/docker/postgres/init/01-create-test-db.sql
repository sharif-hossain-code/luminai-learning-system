-- Runs once, when the local Postgres volume is first created.
-- Creates a separate database for integration tests so they never touch development data.
CREATE DATABASE luminai_test;
