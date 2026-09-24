import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAllowEmoji } = vi.hoisted(() => ({ getAllowEmoji: vi.fn() }));

vi.mock('@/common', () => ({
  ipcBridge: {
    systemSettings: {
      getAllowEmoji: { invoke: getAllowEmoji },
    },
  },
}));

import {
  appendGlobalResponsePreferences,
  getEmojiResponseInstruction,
  NO_EMOJI_INSTRUCTION,
  NO_EMOJI_SKILL,
} from '@/renderer/utils/emojiPreference';

describe('emojiPreference', () => {
  beforeEach(() => getAllowEmoji.mockReset());

  it('does not alter injected skills when emoji is allowed or unset', async () => {
    getAllowEmoji.mockResolvedValue(undefined);
    await expect(appendGlobalResponsePreferences(['zahrs-core'])).resolves.toEqual(['zahrs-core']);

    getAllowEmoji.mockResolvedValue(true);
    await expect(getEmojiResponseInstruction()).resolves.toBeNull();
  });

  it('injects the global response rule when emoji is disabled', async () => {
    getAllowEmoji.mockResolvedValue(false);

    await expect(appendGlobalResponsePreferences(['zahrs-core'])).resolves.toEqual(['zahrs-core', NO_EMOJI_SKILL]);
  });
});
