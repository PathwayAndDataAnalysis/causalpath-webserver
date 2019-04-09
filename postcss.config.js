let conf = {
  plugins: [
    require('postcss-import')(),
    require('postcss-url')([
      {
        filter: '**/*.svg',
        url: 'inline',
        encodeType: 'encodeURIComponent',
        optimizeSvgEncode: true,
        maxSize: 20
      },
      {
        filter: '**/*.woff',
        url: 'inline',
        encodeType: 'base64',
        maxSize: Number.MAX_SAFE_INTEGER
      },
      {
        filter: '**/*.woff2',
        url: 'inline',
        encodeType: 'base64',
        maxSize: Number.MAX_SAFE_INTEGER
      },
      {
        filter: '**/*.ttf',
        url: 'inline',
        encodeType: 'base64',
        maxSize: Number.MAX_SAFE_INTEGER
      },
      {
        filter: '**/*.eot',
        url: 'inline',
        encodeType: 'base64',
        maxSize: Number.MAX_SAFE_INTEGER
      },
      {
        filter: '**/*.otf',
        url: 'inline',
        encodeType: 'base64',
        maxSize: Number.MAX_SAFE_INTEGER
      }
    ])
  ].filter( o => o != null )
};

module.exports = conf;
