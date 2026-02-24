const fs = require('fs');
const https = require('https');

const csvPath = 'birds.csv';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function checkUrl(url) {
    return new Promise((resolve) => {
        if (!url || !url.startsWith('http')) return resolve(false);
        try {
            https.get(url, { 
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' },
                timeout: 5000 
            }, (res) => {
                if (res.statusCode === 200) {
                    resolve(true);
                } else if (res.statusCode === 429) {
                    resolve('RETRY');
                } else {
                    resolve(false);
                }
                res.resume(); // consume response
            }).on('error', () => resolve(false));
        } catch (e) {
            resolve(false);
        }
    });
}

async function main() {
    const content = fs.readFileSync(csvPath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    const dataLines = lines.slice(1);

    console.log(`Checking ${dataLines.length} URLs with delays...`);
    const broken = [];

    for (let i = 0; i < dataLines.length; i++) {
        const parts = dataLines[i].split(',');
        const name = parts[1];
        const url = parts[2];
        
        let ok = await checkUrl(url);
        
        if (ok === 'RETRY') {
            process.stdout.write('R');
            await sleep(2000);
            ok = await checkUrl(url);
        }

        if (!ok || ok === 'RETRY') {
            broken.push({ name, url, line: i + 2 });
            process.stdout.write('X');
        } else {
            process.stdout.write('.');
        }
        
        await sleep(200); // 200ms delay between requests
    }

    console.log('\n\n--- Results ---');
    if (broken.length === 0) {
        console.log('All URLs are working!');
    } else {
        console.log(`Found ${broken.length} broken/rate-limited URLs.`);
        broken.forEach(b => console.log(`Line ${b.line}: ${b.name}`));
    }
}

main();
