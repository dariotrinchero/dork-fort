import fs from "fs";
import path from "path";
import https from "https";

const BUILD_DIR = "build";
const API_KEY = process.env.NEOCITIES_API_KEY;

function walkDir(dir, callback) {
    return fs.promises.readdir(dir, { withFileTypes: true }).then(entries => {
        return Promise.all(entries.map(entry => {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                return walkDir(fullPath, callback);
            } else if (entry.isFile()) {
                return callback(fullPath);
            }
        }));
    });
}

function uploadFile(filePath, relativePath) {
    return new Promise((resolve, reject) => {
        const boundary = "----NodeMultipartBoundary" + Math.random().toString(16);
        const fileStream = fs.createReadStream(filePath);

        const bodyStart =
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="${relativePath}"; filename="${path.basename(relativePath)}"\r\n` +
            `Content-Type: application/octet-stream\r\n\r\n`;
        const bodyEnd = `\r\n--${boundary}--\r\n`;

        const bodyStartBuffer = Buffer.from(bodyStart, "utf8");
        const bodyEndBuffer = Buffer.from(bodyEnd, "utf8");

        const options = {
            method: "POST",
            hostname: "neocities.org",
            path: "/api/upload",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": `multipart/form-data; boundary=${boundary}`,
            },
        };

        fs.stat(filePath, (err, stats) => { // get file size to compute content-length
            if (err) return reject(err);

            options.headers[ "Content-Length" ] = bodyStartBuffer.length + stats.size + bodyEndBuffer.length;

            const req = https.request(options, (res) => {
                let data = "";
                res.on("data", chunk => data += chunk);
                res.on("end", () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.result === "success") {
                            console.log(`Uploaded: ${relativePath}`);
                            resolve();
                        } else {
                            console.error(`Failed to upload ${relativePath}:`, json);
                            reject(new Error("Upload failed"));
                        }
                    } catch (e) { reject(e); }
                });
            });

            req.on("error", reject);
            req.write(bodyStartBuffer);
            fileStream.pipe(req, { end: false });
            fileStream.on("end", () => req.end(bodyEndBuffer));
        });
    });
}

async function main() {
    if (!API_KEY) {
        console.error("NEOCITIES_API_KEY not set");
        process.exit(1);
    }

    try {
        await walkDir(BUILD_DIR, async (filePath) => {
            const relativePath = path.relative(BUILD_DIR, filePath).replace(/\\/g, "/");
            await uploadFile(filePath, relativePath);
        });
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

main();