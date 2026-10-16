const { legacyEncode, decodeLegacyEntities } = require('../../utils/legacyInputEncoding');

describe('legacyEncode (what the removed xssMiddleware did to input)', () => {
  it('HTML-encodes the five characters, & first', () => {
    expect(legacyEncode(`O'Brien & "Co" <b>`)).toBe('O&#39;Brien &amp; &quot;Co&quot; &lt;b&gt;');
  });

  it('strips javascript:, on*= and data: like the middleware did', () => {
    expect(legacyEncode('javascript:x onclick=y data:z')).toBe('x y z');
  });

  it('leaves empty values alone', () => {
    expect(legacyEncode('')).toBe('');
  });
});

describe('decodeLegacyEntities', () => {
  it('reverses the encoding of the five characters', () => {
    expect(decodeLegacyEntities('O&#39;Brien &amp; &quot;Co&quot; &lt;b&gt;')).toBe(`O'Brien & "Co" <b>`);
  });

  it('decodes &amp; last, so text a user typed as "&lt;" survives', () => {
    expect(decodeLegacyEntities(legacyEncode('5 &lt; 6'))).toBe('5 &lt; 6');
    expect(decodeLegacyEntities(legacyEncode('Tom &amp; Jerry'))).toBe('Tom &amp; Jerry');
  });

  it('leaves other entities alone', () => {
    expect(decodeLegacyEntities('Caf&eacute; &#169;')).toBe('Caf&eacute; &#169;');
  });

  it('round-trips any text the encoder did not strip', () => {
    for (const text of [`it's`, `a&b`, `<>"'&`, '&&amp;;', 'plain']) {
      expect(decodeLegacyEntities(legacyEncode(text))).toBe(text);
    }
  });
});
