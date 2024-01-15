import TextToSVG from 'text-to-svg';
import * as path from "path";
import * as fs from "fs";
import readline from "readline";

const dir = path.resolve('./docs/public/svgs');
const textToSVG = TextToSVG.loadSync();
// for (let i = 0; i < 10; i++) {
//     const svg = textToSVG.getSVG(i + '', { x: 0, y: 0, fontSize: 72, anchor: 'top', attributes: { fill: 'transparent', stroke: 'black' } });
//     console.log(svg);
//     fs.writeFileSync(path.join(dir, i + '.svg'), svg);
// }
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
rl.question('请输入文本：', (answer) => {
    const text = answer.trim();

    const svg = textToSVG.getSVG(text, { x: 0, y: 0, fontSize: 72, anchor: 'top', attributes: { fill: 'transparent', stroke: 'black' } });
    console.log(svg);

    process.exit(0);
});

