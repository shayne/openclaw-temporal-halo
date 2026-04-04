import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

export function resolveHaloDeltaPath(filePath: string): string {
	const dir = path.dirname(filePath)
	const ext = path.extname(filePath)
	const base = path.basename(filePath, ext)
	const deltaName = ext ? `${base}.delta${ext}` : `${base}.delta.md`
	return path.join(dir, deltaName)
}

export async function readHaloFile(filePath: string): Promise<string | null> {
	try {
		return await fs.readFile(filePath, "utf-8")
	} catch (err) {
		const code = (err as { code?: unknown } | null)?.code
		if (code === "ENOENT" || code === "ENOTDIR") {
			return null
		}
		throw err
	}
}

export async function removeHaloFile(filePath: string): Promise<void> {
	await fs.rm(filePath, { force: true })
}

async function renameOverwriting(
	tmpPath: string,
	destPath: string,
): Promise<void> {
	try {
		await fs.rename(tmpPath, destPath)
		return
	} catch (err) {
		// On some platforms, rename won't overwrite an existing destination.
		const code = (err as { code?: unknown } | null)?.code
		if (code === "EEXIST" || code === "EPERM" || code === "EACCES") {
			await fs.rm(destPath, { force: true })
			await fs.rename(tmpPath, destPath)
			return
		}
		throw err
	}
}

export async function writeHaloAtomic(
	filePath: string,
	contents: string,
): Promise<void> {
	const dir = path.dirname(filePath)
	await fs.mkdir(dir, { recursive: true })

	const tmpPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`
	await fs.writeFile(tmpPath, contents, "utf-8")
	await renameOverwriting(tmpPath, filePath)
}
