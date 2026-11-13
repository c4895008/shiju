import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { pool } from '../src/db/pool.js';
import { hashPassword } from '../src/services/auth.js';
import { createAdmin, findByUsername } from '../src/services/users.js';
import { checkNickname, checkPassword, checkUsername } from '../src/validate.js';

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const username = (process.env.ADMIN_USERNAME || (await rl.question('管理员用户名：'))).trim();
    const error = checkUsername(username);
    if (error) throw new Error(error);

    const existing = await findByUsername(username);
    const password = process.env.ADMIN_PASSWORD || (await rl.question('密码（输入不回显）：'));
    const passwordError = checkPassword(password);
    if (passwordError) throw new Error(passwordError);

    const nickname = (process.env.ADMIN_NICKNAME || (await rl.question('昵称（回车使用用户名）：'))).trim() || username;
    const nicknameError = checkNickname(nickname);
    if (nicknameError) throw new Error(nicknameError);

    if (existing) {
      throw new Error('用户名已存在。如需重置密码或提权，请直接更新该用户的 password_hash / role。');
    }

    const passwordHash = await hashPassword(password);
    const user = await createAdmin({ username, passwordHash, nickname });
    console.log(`[admin] 已创建管理员 #${user.id} ${user.username}（角色 ${user.role}）`);
  } finally {
    rl.close();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`[admin] 失败：${err.message}`);
  process.exit(1);
});
