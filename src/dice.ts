function rollDie(sides: number): number {
	if (sides <= 0) {
		throw new Error("Number of sides must be greater than 0");
	}

	// To avoid modulo bias, we discard random numbers that fall in the range
	// just above the largest multiple of 'sides' that fits in a 32-bit integer.
	const maxUint32 = 0xFFFFFFFF;
	const limit = maxUint32 - (maxUint32 % sides);
	const buffer = new Uint32Array(1);

	let randomValue: number;
	do {
		window.crypto.getRandomValues(buffer);
		randomValue = buffer[0];
	} while (randomValue >= limit);

	return (randomValue % sides) + 1;
}

export interface RollResult {
	rolls: number[];
	modifier: number;
	sum: number;
	total: number;
	advantageRoll: number;
	disadvantageRoll: number;
	advantageTotal: number;
	disadvantageTotal: number;
}

export function rollDice(sides: number, count: number, mod: number = 0): RollResult {
	let results: RollResult = {
		rolls: [],
		modifier: mod,
		sum: mod,
		total: 0,
		advantageRoll: 0,
		disadvantageRoll: sides + 1,
		advantageTotal: 0,
		disadvantageTotal: 0
	}
	for (let i = 0; i < count; i++) {
		const r = rollDie(sides);
		results.rolls.push(r);
		results.sum += r;
		if (results.total === 0) {
			results.total = r + mod;
		}
		if (r > results.advantageRoll) {
			results.advantageRoll = r;
			results.advantageTotal = r + mod;
		}
		if (r < results.disadvantageRoll) {
			results.disadvantageRoll = r;
			results.disadvantageTotal = r + mod;
		}
	}
	return results;
}
