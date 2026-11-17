import { config } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { decryptSecret, encryptSecret } from '../utils/secretBox.js';
import { GEMINI_MODELS, verifyGeminiKey } from '../workers/geminiClient.js';
import { safeUser } from '../utils/auth.js';

export function getProfile(request, response) {
  response.json({ user: safeUser(request.user) });
}

export async function updateProfile(request, response) {
  const updates = {};
  if (request.body.name !== undefined) {
    const name = String(request.body.name).trim();
    if (name.length < 2 || name.length > 80) return response.status(400).json({ message: 'Name must be between 2 and 80 characters.' });
    updates.name = name;
  }
  if (request.body.bio !== undefined) {
    const bio = String(request.body.bio).trim();
    if (bio.length > 280) return response.status(400).json({ message: 'Bio cannot exceed 280 characters.' });
    updates.bio = bio;
  }

  const user = await prisma.user.update({ where: { id: request.user.id }, data: updates });
  response.json({ user: safeUser(user) });
}

/* ---------- AI (Gemini) settings ---------- */

function aiSettingsView(user) {
  const hasPersonalKey = Boolean(user.geminiApiKeyEnc);
  const serverKeyAvailable = Boolean(config.geminiApiKey) && config.workerMode !== 'stub';
  return {
    hasPersonalKey,
    keyHint: hasPersonalKey ? user.geminiKeyHint || '' : '',
    model: user.geminiModel || config.geminiModel,
    models: GEMINI_MODELS,
    serverKeyAvailable,
    // What the next upload will use
    activeProvider: hasPersonalKey ? 'user' : serverKeyAvailable ? 'server' : 'stub'
  };
}

export function getAiSettings(request, response) {
  response.json({ settings: aiSettingsView(request.user) });
}

export async function updateAiSettings(request, response) {
  const apiKey = request.body.apiKey === undefined ? undefined : String(request.body.apiKey).trim();
  const model = request.body.model === undefined ? undefined : String(request.body.model).trim();

  if (model !== undefined && !GEMINI_MODELS.includes(model)) {
    return response.status(400).json({ message: `Choose one of: ${GEMINI_MODELS.join(', ')}.` });
  }
  if (apiKey !== undefined && (apiKey.length < 20 || apiKey.length > 200 || /\s/.test(apiKey))) {
    return response.status(400).json({ message: 'That does not look like a Gemini API key.' });
  }

  const data = {};
  const effectiveModel = model || request.user.geminiModel || config.geminiModel;
  if (apiKey) {
    await verifyGeminiKey(apiKey, effectiveModel);
    data.geminiApiKeyEnc = encryptSecret(apiKey);
    data.geminiKeyHint = apiKey.slice(-4);
  } else if (model && request.user.geminiApiKeyEnc) {
    // Changing only the model: make sure the saved key can use it.
    const savedKey = decryptSecret(request.user.geminiApiKeyEnc);
    if (!savedKey) return response.status(400).json({ message: 'The saved key can no longer be read. Please enter it again.' });
    await verifyGeminiKey(savedKey, model);
  }
  if (model) data.geminiModel = model;
  if (!Object.keys(data).length) return response.status(400).json({ message: 'Nothing to update.' });

  const user = await prisma.user.update({ where: { id: request.user.id }, data });
  response.json({ settings: aiSettingsView(user) });
}

export async function deleteAiKey(request, response) {
  const user = await prisma.user.update({
    where: { id: request.user.id },
    data: { geminiApiKeyEnc: null, geminiKeyHint: null }
  });
  response.json({ settings: aiSettingsView(user) });
}
