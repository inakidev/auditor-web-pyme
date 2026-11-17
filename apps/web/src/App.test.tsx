import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App.js';

describe('App', () => {
  it('muestra el título de la aplicación', () => {
    expect(renderToStaticMarkup(<App />)).toContain('<h1>Auditor Web Pyme</h1>');
  });
});
