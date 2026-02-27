import type { Config } from 'jest';

const config: Config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/*.test.ts'],
    moduleFileExtensions: ['ts', 'js', 'json'],
    collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts'],
    coverageDirectory: 'coverage',
    // uuid v11 ships ESM-only; transform its .js files with ts-jest
    transformIgnorePatterns: ['node_modules/(?!uuid/)'],
    transform: {
        '^.+\\.ts$': 'ts-jest',
        '^.+\\.js$': 'ts-jest',
    },
};

export default config;
