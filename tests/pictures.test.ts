import { describe, expect, it } from 'vitest';
import { countPictures, pictureTime, shotTimes } from '../src/core/pictures.ts';
import { splitRecording } from '../src/core/sessions.ts';
import { pictureName, recording, SEVRA } from './fakes.ts';

/** A moment on this computer's clock. */
const local = (year: number, month: number, day: number, h: number, m: number, s: number) =>
	new Date(year, month - 1, day, h, m, s).getTime();

describe('a picture’s file name', () => {
	it('says when it was taken, on this computer’s clock', () => {
		expect(pictureTime('WoWScrnShot_110426_201502.jpg')).toBe(local(2026, 11, 4, 20, 15, 2));
		expect(pictureTime('WoWScrnShot_110426_201502.tga')).toBe(local(2026, 11, 4, 20, 15, 2));
		expect(pictureTime('wowscrnshot_010127_000000.JPG')).toBe(local(2027, 1, 1, 0, 0, 0));
	});

	it('is the game’s or nothing', () => {
		for (const name of [
			'WoWScrnShot_110426_201502',
			'WoWScrnShot_110426_201502.jpg.txt',
			'Screenshot_110426_201502.jpg',
			'WoWScrnShot_1104_201502.jpg',
			'WoWScrnShot_133126_201502.jpg',
			'WoWScrnShot_043126_201502.jpg',
			'notes.txt'
		]) {
			expect(pictureTime(name), name).toBeNull();
		}
	});
});

describe('the addon’s pictures', () => {
	const T = 1793530000;

	it('are the SHOT lines that say why, at the session’s time and the line’s', () => {
		const file = splitRecording(
			recording(SEVRA, 'Sevra', [
				[T, 2, true, SEVRA, ['2500\tSHOT\tlevel', '2600\tSHOT', '9000\tSHOT\tzone']],
				[T + 900, 0, true, SEVRA, ['400\tSHOT\tboss']]
			])
		);
		expect(shotTimes(file.sessions)).toEqual([T * 1000 + 2500, T * 1000 + 9000, (T + 900) * 1000 + 400]);
	});

	it('are counted by the files still there, each file once', () => {
		const at = local(2026, 11, 4, 20, 15, 2) + 300;
		// Named a second before the line: the same picture.
		expect(countPictures([at], [pictureName(at - 1000)])).toBe(1);
		// Named in the line's own second.
		expect(countPictures([at], [pictureName(at)])).toBe(1);
		// Deleted by the player: nothing there.
		expect(countPictures([at], [])).toBe(0);
		// One file can't be two pictures, and a .jpg and a .tga of the same second are one.
		expect(countPictures([at, at + 500], [pictureName(at)])).toBe(1);
		expect(countPictures([at], [pictureName(at), pictureName(at, 'tga')])).toBe(1);
		// Two pictures, two files.
		expect(countPictures([at, at + 10000], [pictureName(at), pictureName(at + 9000)])).toBe(2);
		// Other files in the folder are no business of this.
		expect(countPictures([at], ['desktop.ini', 'Thumbs.db', pictureName(at)])).toBe(1);
	});

	it('match a file named up to two seconds before the line, and no earlier or later', () => {
		const second = local(2026, 11, 4, 20, 15, 2);
		const at = second + 900;
		expect(countPictures([at], [pictureName(second - 2000)])).toBe(1);
		expect(countPictures([at], [pictureName(second - 3000)])).toBe(0);
		expect(countPictures([at], [pictureName(second + 1000)])).toBe(0);
	});

	it('match across the end of a year', () => {
		// Taken in the last second of 2026, its SHOT line written in the first of 2027.
		const named = local(2026, 12, 31, 23, 59, 59);
		const line = local(2027, 1, 1, 0, 0, 0) + 400;
		expect(pictureName(named)).toBe('WoWScrnShot_123126_235959.jpg');
		expect(countPictures([line], ['WoWScrnShot_123126_235959.jpg'])).toBe(1);
		expect(countPictures([line], ['WoWScrnShot_123125_235959.jpg'])).toBe(0);
	});

	it('never include one the player took with their own key', () => {
		const file = splitRecording(
			recording(SEVRA, 'Sevra', [[T, 0, true, SEVRA, ['1000\tSHOT', '2000\tSHOT\t']]])
		);
		const shots = shotTimes(file.sessions);
		expect(shots).toEqual([]);
		expect(countPictures(shots, [pictureName(T * 1000 + 1000), pictureName(T * 1000 + 2000)])).toBe(0);
	});
});
