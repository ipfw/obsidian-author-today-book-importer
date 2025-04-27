import typescript from 'rollup-plugin-typescript2';

export default {
  input: 'src/main.ts',
  output: {
    dir: '.',
    format: 'cjs',
    sourcemap: true,
    entryFileNames: 'main.js'
  },
  external: ['obsidian'],
  plugins: [
    typescript({
      tsconfig: 'tsconfig.json',
      clean: true
    })
  ]
};

