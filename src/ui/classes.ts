// The game's classes by classID, with the game's own class colours, as the site shows them. Names
// are labels only: the recording carries the number.

export const CLASSES: Record<number, { name: string; color: string }> = {
	1: { name: 'Warrior', color: '#C69B6D' },
	2: { name: 'Paladin', color: '#F48CBA' },
	3: { name: 'Hunter', color: '#AAD372' },
	4: { name: 'Rogue', color: '#FFF468' },
	5: { name: 'Priest', color: '#FFFFFF' },
	6: { name: 'Death Knight', color: '#C41E3A' },
	7: { name: 'Shaman', color: '#0070DD' },
	8: { name: 'Mage', color: '#3FC7EB' },
	9: { name: 'Warlock', color: '#8788EE' },
	10: { name: 'Monk', color: '#00FF98' },
	11: { name: 'Druid', color: '#FF7C0A' },
	12: { name: 'Demon Hunter', color: '#A330C9' },
	13: { name: 'Evoker', color: '#33937F' }
};
