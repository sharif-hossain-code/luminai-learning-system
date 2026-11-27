import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'src/generated/**', 'prisma/migrations/**'] },
  eslint.configs.recommended,
  tseslint.configs.strict,
);
