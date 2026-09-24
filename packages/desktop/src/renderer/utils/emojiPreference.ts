import { ipcBridge } from '@/common';

export const NO_EMOJI_SKILL = 'boloui-no-emoji';
export const NO_EMOJI_INSTRUCTION =
  'Global response preference: Do not use emoji, pictographs, emoticons, or decorative Unicode symbols in assistant responses.';

/** Returns the global response instruction when emoji output is disabled. */
export async function getEmojiResponseInstruction(): Promise<string | null> {
  try {
    const allowEmoji = await ipcBridge.systemSettings?.getAllowEmoji?.invoke();
    return allowEmoji === false ? NO_EMOJI_INSTRUCTION : null;
  } catch {
    return null;
  }
}

/** Adds global response preferences to a new conversation's injected skills. */
export async function appendGlobalResponsePreferences(skills: string[]): Promise<string[]> {
  const instruction = await getEmojiResponseInstruction();
  return instruction && !skills.includes(NO_EMOJI_SKILL) ? [...skills, NO_EMOJI_SKILL] : skills;
}
