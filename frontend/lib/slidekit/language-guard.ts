// Classroom-language guard for free-text requests, checked before anything is sent to a model.
const BLOCKED = /\b(fuck\w*|shit\w*|bitch\w*|bastard|cunt|dick|cock|pussy|porn\w*|sex\w*|nude\w*|rape\w*|nigg\w*|slut|whore|chutiya\w*|madarchod|bhenchod|bc|mc|gandu|randi|harami)\b/i;
export const isBlocked = (s: string) => BLOCKED.test(s);
