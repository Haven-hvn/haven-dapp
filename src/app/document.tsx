import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  if (typeof window !== 'undefined' && !window.localStorage) {
                    var storage = {
                      _data: {},
                      getItem: function(key) { return this._data[key] || null; },
                      setItem: function(key, value) { this._data[key] = value; },
                      removeItem: function(key) { delete this._data[key]; },
                      clear: function() { this._data = {}; },
                      key: function(i) { var keys = Object.keys(this._data); return keys[i] || null; },
                      get length() { return Object.keys(this._data).length; }
                    };
                    Object.defineProperty(window, 'localStorage', {
                      value: storage,
                      writable: true,
                      configurable: false
                    });
                  }
                } catch(e) {
                  console.warn('localStorage polyfill failed:', e);
                }
              })();
            `,
          }}
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
