import { api } from '@game-life/platform-web';
import type { ColorGuessConfig, ColorGuessView } from '../view.js';

const base = '/games/color-guess/rooms';

export async function fetchColorGuessRoom(code: string): Promise<ColorGuessView> {
  const { data } = await api.get<ColorGuessView>(`${base}/${encodeURIComponent(code)}`);
  return data;
}

async function action(
  code: string,
  type: string,
  payload?: Record<string, unknown>,
): Promise<ColorGuessView> {
  const { data } = await api.post<ColorGuessView>(
    `${base}/${encodeURIComponent(code)}/action`,
    { type, payload },
  );
  return data;
}

export function updateColorGuessConfig(
  code: string,
  patch: Partial<ColorGuessConfig>,
): Promise<ColorGuessView> {
  return action(code, 'action:config', { ...patch });
}

export function startColorGuess(code: string): Promise<ColorGuessView> {
  return action(code, 'action:start');
}

export function setColorGuessSecret(code: string, colors: number[]): Promise<ColorGuessView> {
  return action(code, 'action:secret', { colors });
}

export function submitColorGuess(code: string, colors: number[]): Promise<ColorGuessView> {
  return action(code, 'action:guess', { colors });
}
