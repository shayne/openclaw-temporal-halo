import fs from "node:fs"

const pkgPath = new URL("../package.json", import.meta.url)
const pluginPath = new URL("../openclaw.plugin.json", import.meta.url)

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"))
const plugin = JSON.parse(fs.readFileSync(pluginPath, "utf8"))

if (typeof pkg.version !== "string" || !pkg.version.trim()) {
	throw new Error("package.json version is missing/invalid")
}

plugin.version = pkg.version
fs.writeFileSync(pluginPath, `${JSON.stringify(plugin, null, "\t")}\n`)

console.log(`synced openclaw.plugin.json version -> ${pkg.version}`)
