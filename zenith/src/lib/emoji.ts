export interface EmojiEntry { e: string; k: string }
export interface EmojiGroup { name: string; items: EmojiEntry[] }

export const EMOJI_GROUPS: EmojiGroup[] = [
  { name: 'Frequently used', items: [
    { e: '📝', k: 'memo note write' }, { e: '📄', k: 'page document' }, { e: '📁', k: 'folder' },
    { e: '🗂️', k: 'dividers database' }, { e: '📚', k: 'books library reading' }, { e: '✅', k: 'check done task' },
    { e: '🎯', k: 'target goal okr' }, { e: '💡', k: 'idea bulb' }, { e: '🔥', k: 'fire hot streak' },
    { e: '⭐', k: 'star favorite' }, { e: '🚀', k: 'rocket launch ship' }, { e: '🧠', k: 'brain second mind' },
    { e: '🏔️', k: 'mountain peak zenith' }, { e: '💎', k: 'gem diamond luxury' }, { e: '🏆', k: 'trophy win' },
    { e: '📌', k: 'pin important' }, { e: '🗓️', k: 'calendar planner' }, { e: '✍️', k: 'writing hand journal' },
  ]},
  { name: 'Smileys', items: [
    { e: '😀', k: 'grin happy' }, { e: '😄', k: 'smile laugh' }, { e: '🙂', k: 'slight smile' },
    { e: '😉', k: 'wink' }, { e: '😊', k: 'blush' }, { e: '😍', k: 'heart eyes love' },
    { e: '🤩', k: 'star struck' }, { e: '😎', k: 'cool sunglasses' }, { e: '🤓', k: 'nerd' },
    { e: '🤔', k: 'thinking' }, { e: '😅', k: 'sweat' }, { e: '😂', k: 'joy lol' },
    { e: '🥳', k: 'party celebrate' }, { e: '😴', k: 'sleep tired' }, { e: '🤯', k: 'mind blown' },
    { e: '😇', k: 'angel' }, { e: '🙃', k: 'upside down' }, { e: '😌', k: 'relieved calm' },
    { e: '🥲', k: 'tear smile' }, { e: '😤', k: 'determined' },
  ]},
  { name: 'People', items: [
    { e: '👋', k: 'wave hello' }, { e: '👍', k: 'thumbs up yes' }, { e: '👎', k: 'thumbs down no' },
    { e: '👏', k: 'clap' }, { e: '🙏', k: 'pray thanks' }, { e: '💪', k: 'muscle strong gym' },
    { e: '🤝', k: 'handshake deal' }, { e: '🫶', k: 'heart hands' }, { e: '🧑‍💻', k: 'developer coding' },
    { e: '🧑‍🎨', k: 'artist design' }, { e: '🧑‍🍳', k: 'chef cooking recipe' }, { e: '🧑‍🏫', k: 'teacher study' },
    { e: '🏃', k: 'run fitness' }, { e: '🧘', k: 'yoga meditate' }, { e: '👨‍👩‍👧', k: 'family' },
    { e: '🗣️', k: 'speak talk meeting' }, { e: '👀', k: 'eyes watch review' }, { e: '🤞', k: 'fingers crossed luck' },
  ]},
  { name: 'Nature', items: [
    { e: '🌱', k: 'seedling grow habit' }, { e: '🌿', k: 'herb plant' }, { e: '🌳', k: 'tree' },
    { e: '🌸', k: 'blossom flower' }, { e: '🌹', k: 'rose' }, { e: '🌻', k: 'sunflower' },
    { e: '🍀', k: 'clover luck' }, { e: '🌙', k: 'moon night' }, { e: '☀️', k: 'sun day' },
    { e: '⛅', k: 'cloud weather' }, { e: '🌈', k: 'rainbow' }, { e: '⚡', k: 'lightning fast power' },
    { e: '❄️', k: 'snow winter' }, { e: '🌊', k: 'wave ocean' }, { e: '�войны', k: '' },
    { e: '🐶', k: 'dog pet' }, { e: '🐱', k: 'cat pet' }, { e: '🦋', k: 'butterfly' },
    { e: '🦅', k: 'eagle bird' }, { e: '🐝', k: 'bee busy' },
  ]},
  { name: 'Food', items: [
    { e: '☕', k: 'coffee cafe morning' }, { e: '🍵', k: 'tea matcha' }, { e: '🍕', k: 'pizza' },
    { e: '🍔', k: 'burger' }, { e: '🍣', k: 'sushi japan' }, { e: '🥗', k: 'salad healthy' },
    { e: '🍎', k: 'apple fruit' }, { e: '🥑', k: 'avocado' }, { e: '🍰', k: 'cake dessert birthday' },
    { e: '🍷', k: 'wine' }, { e: '🍾', k: 'champagne celebrate' }, { e: '🧁', k: 'cupcake' },
    { e: '🍩', k: 'donut' }, { e: '🥐', k: 'croissant breakfast' }, { e: '🍜', k: 'ramen noodles' },
  ]},
  { name: 'Travel & places', items: [
    { e: '🏔️', k: 'mountain peak summit' }, { e: '🗻', k: 'fuji mountain' }, { e: '🏠', k: 'home house' },
    { e: '🏢', k: 'office building work' }, { e: '🏛️', k: 'classical bank museum' }, { e: '🗼', k: 'tower paris' },
    { e: '🗽', k: 'liberty new york' }, { e: '🏖️', k: 'beach vacation' }, { e: '🏕️', k: 'camping' },
    { e: '✈️', k: 'plane travel flight' }, { e: '🚆', k: 'train' }, { e: '🚗', k: 'car drive' },
    { e: '🛳️', k: 'ship cruise' }, { e: '🌍', k: 'earth world globe' }, { e: '🧭', k: 'compass navigate' },
    { e: '🗺️', k: 'map roadmap' },
  ]},
  { name: 'Activities', items: [
    { e: '⚽', k: 'soccer football' }, { e: '🏀', k: 'basketball' }, { e: '🎾', k: 'tennis' },
    { e: '🏋️', k: 'weights gym workout' }, { e: '🎮', k: 'game controller' }, { e: '�box', k: '' },
    { e: '🎨', k: 'palette art design' }, { e: '🎬', k: 'movie film clapper' }, { e: '🎵', k: 'music note' },
    { e: '🎸', k: 'guitar' }, { e: '🎤', k: 'mic karaoke podcast' }, { e: '📷', k: 'camera photo' },
    { e: '🎟️', k: 'ticket event' }, { e: '🎁', k: 'gift present' }, { e: '🎉', k: 'tada party confetti' },
    { e: '🧩', k: 'puzzle piece' }, { e: '♟️', k: 'chess strategy' }, { e: '🎲', k: 'dice random' },
  ]},
  { name: 'Objects', items: [
    { e: '💻', k: 'laptop computer' }, { e: '🖥️', k: 'desktop monitor' }, { e: '📱', k: 'phone mobile' },
    { e: '⌚', k: 'watch time' }, { e: '⏰', k: 'alarm clock' }, { e: '⏳', k: 'hourglass time' },
    { e: '🔋', k: 'battery energy' }, { e: '🔌', k: 'plug power' }, { e: '🛠️', k: 'tools build' },
    { e: '🔧', k: 'wrench fix' }, { e: '⚙️', k: 'gear settings' }, { e: '🔑', k: 'key access' },
    { e: '🔒', k: 'lock secure private' }, { e: '💰', k: 'money bag finance' }, { e: '💳', k: 'card payment' },
    { e: '📈', k: 'chart up growth stocks' }, { e: '📉', k: 'chart down' }, { e: '📊', k: 'bar chart analytics' },
    { e: '🧾', k: 'receipt expenses' }, { e: '💼', k: 'briefcase business work' }, { e: '📦', k: 'box package ship' },
    { e: '🔭', k: 'telescope vision' }, { e: '🔬', k: 'microscope research science' }, { e: '🧪', k: 'test tube experiment' },
    { e: '💊', k: 'pill health' }, { e: '🩺', k: 'health doctor' }, { e: '🛏️', k: 'bed sleep' },
    { e: '🛒', k: 'cart shopping groceries' }, { e: '✉️', k: 'envelope email mail' }, { e: '📮', k: 'postbox' },
    { e: '🖊️', k: 'pen write' }, { e: '✏️', k: 'pencil draft' }, { e: '📏', k: 'ruler measure' },
    { e: '📐', k: 'triangle ruler design' }, { e: '🗃️', k: 'card file box archive' }, { e: '🗄️', k: 'file cabinet' },
    { e: '📋', k: 'clipboard tasks' }, { e: '📒', k: 'ledger notebook' }, { e: '📕', k: 'red book' },
    { e: '📗', k: 'green book' }, { e: '📘', k: 'blue book' }, { e: '📙', k: 'orange book' },
    { e: '🔖', k: 'bookmark save' }, { e: '🧷', k: 'safety pin' }, { e: '🪙', k: 'coin crypto' },
    { e: '🏷️', k: 'label tag' }, { e: '🎓', k: 'graduation study school university' },
  ]},
  { name: 'Symbols', items: [
    { e: '❤️', k: 'heart love red' }, { e: '🧡', k: 'orange heart' }, { e: '💛', k: 'yellow heart' },
    { e: '💚', k: 'green heart' }, { e: '💙', k: 'blue heart' }, { e: '💜', k: 'purple heart' },
    { e: '🖤', k: 'black heart' }, { e: '✨', k: 'sparkles ai magic' }, { e: '💫', k: 'dizzy star' },
    { e: '🔆', k: 'bright' }, { e: '✔️', k: 'check mark' }, { e: '❌', k: 'cross x no' },
    { e: '❗', k: 'exclamation important' }, { e: '❓', k: 'question' }, { e: '➕', k: 'plus add' },
    { e: '♾️', k: 'infinity' }, { e: '🔱', k: 'trident' }, { e: '🏁', k: 'finish flag done' },
    { e: '🚩', k: 'flag red milestone' }, { e: '🔴', k: 'red circle' }, { e: '🟠', k: 'orange circle' },
    { e: '🟡', k: 'yellow circle' }, { e: '🟢', k: 'green circle' }, { e: '🔵', k: 'blue circle' },
    { e: '🟣', k: 'purple circle' }, { e: '⚫', k: 'black circle' }, { e: '🟤', k: 'brown circle' },
    { e: '🔶', k: 'orange diamond' }, { e: '🔷', k: 'blue diamond' }, { e: '💠', k: 'diamond dot' },
  ]},
];

// patch out two accidental bad entries defensively
for (const g of EMOJI_GROUPS) g.items = g.items.filter((it) => it.k !== '');

export function searchEmoji(q: string): EmojiEntry[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const out: EmojiEntry[] = [];
  for (const g of EMOJI_GROUPS) {
    for (const it of g.items) {
      if (it.k.includes(s)) out.push(it);
      if (out.length >= 60) return out;
    }
  }
  return out;
}

export const PAGE_ICON_SUGGESTIONS = ['📝','📄','📁','🗂️','📚','🎯','💡','🚀','🧠','🏔️','💎','🗓️','✅','📌','📊','🧪','🏆','☕','🌱','✈️'];

export function randomPageIcon(): string {
  return PAGE_ICON_SUGGESTIONS[Math.floor(Math.random() * PAGE_ICON_SUGGESTIONS.length)];
}
