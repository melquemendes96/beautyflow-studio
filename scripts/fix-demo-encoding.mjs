import fs from "node:fs";

const file = "src/components/demo/DemoBookingPreview.tsx";
let s = fs.readFileSync(file, "utf8");

const pairs = [
  ["Mês anterior".normalize(), "Mês anterior"], // noop if already good
  ["MÃªs anterior", "Mês anterior"],
  ["PrÃ³ximo mÃªs", "Próximo mês"],
  ["SÃ¡b", "Sáb"],
  ["nÃ£o", "não"],
  ["Ã s", "às"],
  ["ServiÃ§os", "Serviços"],
  ["HorÃ¡rio", "Horário"],
  ["â†", "←"],
  ["Confirmandoâ€¦", "Confirmando…"],
  ["concluÃ­da", "concluída"],
  ["EstÃºdio", "Estúdio"],
  ["InÃ­cio", "Início"],
  ["DuraÃ§Ã£o", "Duração"],
  ["serviÃ§o", "serviço"],
  ["serviÃ§os", "serviços"],
];

for (const [a, b] of pairs) {
  if (s.includes(a)) {
    s = s.split(a).join(b);
    console.log("fixed:", a, "->", b);
  }
}

fs.writeFileSync(file, s, "utf8");
const left = s.split(/\n/).filter((l) => /Ã|Â|â€|â†/.test(l));
console.log("remaining lines:", left.length);
if (left.length) console.log(left.join("\n"));
