const fs = require('fs');
let code = fs.readFileSync('server/tests/lab-02/attachments.api.test.ts', 'utf8');
code = code.replace(/\\\/api\/attachments\\\/\\\/download\\/g, '\/api/attachments/\/download\');
code = code.replace(/\\\/api\/attachments\/\\\\/g, '\/api/attachments/\\');
code = code.replace(/\\\/api\/tickets\/\\\\/g, '\/api/tickets/\\');
fs.writeFileSync('server/tests/lab-02/attachments.api.test.ts', code);
