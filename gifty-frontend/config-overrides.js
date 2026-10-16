const webpack = require('webpack');

const webpackOverride = function override(config, env) {
  // Configure source-map-loader to ignore react-datepicker
  config.module.rules.push({
    test: /\.js$/,
    enforce: 'pre',
    use: [{
      loader: require.resolve('source-map-loader'),
      options: {
        filterSourceMappingUrl: (url, resourcePath) => {
          // Ignore source maps for react-datepicker package
          if (resourcePath.includes('node_modules/react-datepicker')) {
            return false;
          }
          return true;
        }
      }
    }]
  });

  // Add fallbacks for node.js core modules
  config.resolve.fallback = {
    ...config.resolve.fallback,
    "path": require.resolve("path-browserify"),
    "url": require.resolve("url/"),
    "fs": false,
    "crypto": require.resolve("crypto-browserify"),
    "stream": require.resolve("stream-browserify"),
    "buffer": require.resolve("buffer/"),
    "util": require.resolve("util/"),
    "http": require.resolve("stream-http"),
    "https": require.resolve("https-browserify"),
    "os": require.resolve("os-browserify/browser"),
    "assert": require.resolve("assert/"),
    "process/browser": require.resolve("process/browser.js"),
    "zlib": require.resolve("browserify-zlib"),
    "querystring": require.resolve("querystring-es3"),
    "vm": require.resolve("vm-browserify"),
    "net": false,
  };

  // Add plugins to provide global variables
  config.plugins = [
    ...config.plugins,
    new webpack.ProvidePlugin({
      process: 'process/browser.js',
      Buffer: ['buffer', 'Buffer'],
    }),
  ];

  // Pages are lazy chunks. By default webpack copies a small module shared by
  // several of them (Modal, Button, the forms) into each page chunk, CSS
  // included; a second copy of that CSS, inserted after a page's own rules,
  // would then win the cascade over the page's overrides. Shared components
  // go into one chunk instead, so their CSS is inserted once, before the
  // page that first needs them.
  config.optimization.splitChunks = {
    ...config.optimization.splitChunks,
    cacheGroups: {
      ...(config.optimization.splitChunks && config.optimization.splitChunks.cacheGroups),
      sharedComponents: {
        test: /[\\/]src[\\/]components[\\/]/,
        chunks: 'async',
        minChunks: 2,
        minSize: 0,
        name: 'shared-components',
        priority: 10,
        reuseExistingChunk: true,
      },
    },
  };

  // No inline webpack runtime in index.html: the server's CSP allows scripts
  // only from files (script-src 'self'). Same as INLINE_RUNTIME_CHUNK=false,
  // but independent of how the build is started.
  config.plugins = (config.plugins || []).filter(
    (plugin) => !(plugin && plugin.constructor && plugin.constructor.name === 'InlineChunkHtmlPlugin')
  );

  return config;
};

// Pin every Jest run to a non-UTC zone so date helpers are tested where
// UTC-vs-local bugs actually show (see jest.global-setup.js).
module.exports = {
  webpack: webpackOverride,
  jest: (config) => ({
    ...config,
    globalSetup: require.resolve('./jest.global-setup.js'),
  }),
};
