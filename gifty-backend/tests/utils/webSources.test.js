// Search titles are stored as plain text: markup removed, entities decoded once.
const { buildWebSources } = require('../../utils/webSources');

const titleOf = (title) => buildWebSources([{ title, url: 'https://example.com/p' }])[0].title;

describe('web source titles', () => {
  it.each([
    ['<strong>Rider</strong>&#8217;s guide', 'Rider’s guide'],
    ['Tom&apos;s &amp; Jerry&#x2019;s', 'Tom\'s & Jerry’s'],
    ['Fish &amp;amp; chips', 'Fish &amp; chips'],
    ['Plain title', 'Plain title']
  ])('%p -> %p', (input, expected) => {
    expect(titleOf(input)).toBe(expected);
  });
});
