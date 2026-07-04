import { describe, expect, it } from 'vitest';
import { citationSuggestionFields, suggestCitationUse } from './citationDefaults';

describe('suggestCitationUse (§8-4 매핑)', () => {
  it('maps each label to its default citation purpose', () => {
    expect(suggestCitationUse('yellow')).toBe('premise');
    expect(suggestCitationUse('green')).toBe('method');
    expect(suggestCitationUse('blue')).toBe('comparison');
    expect(suggestCitationUse('pink')).toBe('limitation');
    expect(suggestCitationUse('violet')).toBe('premise');
  });

  it('suggests nothing for 질문/후속 확인 or missing color', () => {
    expect(suggestCitationUse('orange')).toBeUndefined();
    expect(suggestCitationUse(undefined)).toBeUndefined();
  });
});

describe('citationSuggestionFields', () => {
  it('marks suggested purposes as unconfirmed', () => {
    expect(citationSuggestionFields('pink')).toEqual({
      citationUse: 'limitation',
      citationSuggested: true,
    });
  });

  it('returns empty fields when there is no suggestion (자동 확정 금지)', () => {
    expect(citationSuggestionFields('orange')).toEqual({});
    expect(citationSuggestionFields(undefined)).toEqual({});
  });
});
