const fs = require('fs');
const readline = require('readline');

const csvPath = 'birds.csv';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function run() {
    if (!fs.existsSync(csvPath)) {
        console.error(`Error: ${csvPath} not found.`);
        process.exit(1);
    }

    let content = fs.readFileSync(csvPath, 'utf8');
    let lines = content.split('
');
    let header = lines[0];
    let rows = lines.slice(1).filter(l => l.trim() !== '');

    console.log('Bird Image Filler');
    console.log('Type "exit" to save and quit, or press Enter to skip a bird.
');

    for (let i = 0; i < rows.length; i++) {
        let cols = rows[i].split(',');
        let name = cols[1];
        let media = cols[2];

        if (media === 'image missing') {
            const searchQuery = encodeURIComponent(`${name} bird`);
            const searchUrl = `https://www.google.com/search?q=${searchQuery}&tbm=isch`;
            
            console.log(`
Next: ${name}`);
            console.log(`Search: ${searchUrl}`);
            
            let url = await question('URL: ');
            
            if (url.toLowerCase() === 'exit') {
                break;
            }
            
            if (url.trim() !== '') {
                cols[2] = url.trim();
                rows[i] = cols.join(',');
                console.log(`Added URL for ${name}.`);
            } else {
                console.log(`Skipped ${name}.`);
            }
        }
    }

    const newContent = [header, ...rows].join('
') + (lines[lines.length-1] === '' ? '
' : '');
    fs.writeFileSync(csvPath, newContent);
    console.log('
Progress saved to birds.csv.');
    rl.close();
}

run();
