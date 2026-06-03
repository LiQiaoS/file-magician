import neostandard from 'neostandard';

export default neostandard({
  globals: {
    process: 'readonly',
  },
  ignores: [
    'node_modules/',
    'tests/',
    'coverage/',
  ],
});
