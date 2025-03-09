import { Application, Router } from "https://deno.land/x/oak@v12.5.0/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { v4 } from "https://deno.land/std@0.181.0/uuid/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
/**
 * Deno KV bilan ishlash uchun instansiya.
 */
const kv = await Deno.openKv();

/**
 * API endpointlarini tushuntirib beradigan dokumentatsiya HTML.
 */
const docHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Deno KV CRUD API Documentation</title>
</head>
<body>
  <h1>Deno KV CRUD API</h1>
  <p>Quyida mavjud endpointlar keltirilgan:</p>
  <ul>
    <li>
      <strong>POST /register</strong>  
      <ul>
        <li>Body (JSON): 
          <pre>{
  "firstName": "xamidullo",
  "lastName": "xudoyberdiyev",
  "email": "example@gmail.com",
  "password": "123456",
  "phone": "+99894611006612",
  "address": "Toshkent"
}</pre></li>
        <li>Maqsad: Yangi foydalanuvchini ro‘yxatdan o‘tkazish</li>
        <li>Validation: firstName, lastName, email, password, phone, address – barchasi bo‘sh bo‘lmasligi, email format bo‘lishi, password kamida 6 belgi, phone kamida 7 ta raqam (yoki + bilan), va hokazo.</li>
      </ul>
    </li>
    <li>
      <strong>POST /login</strong>
      <ul>
        <li>Body (JSON): 
          <pre>{
  "email": "example@gmail.com",
  "password": "123456"
}</pre></li>
        <li>Maqsad: Mavjud foydalanuvchi bilan tizimga kirish</li>
      </ul>
    </li>
    <li>
      <strong>GET /users</strong>
      <ul>
        <li>Maqsad: Barcha foydalanuvchilarni ko‘rish</li>
      </ul>
    </li>
    <li>
      <strong>PUT /users/:email</strong>
      <ul>
        <li>Body (JSON, ixtiyoriy maydonlar): 
          <pre>{
  "firstName": "NewFirstName",
  "lastName": "NewLastName",
  "password": "NewPassword",
  "phone": "+99899...",
  "address": "NewAddress"
}</pre></li>
        <li>Maqsad: :email ga mos foydalanuvchini yangilash (o‘zgartirish kerak bo‘lgan maydonlargina yuboriladi)</li>
      </ul>
    </li>
    <li>
      <strong>DELETE /users/:email</strong>
      <ul>
        <li>Maqsad: :email ga mos foydalanuvchini o‘chirish</li>
      </ul>
    </li>
  </ul>
</body>
</html>`;

/**
 * [GET] /  => HTML-formatdagi documentation sahifasi
 */
const showDocumentation = ({ response }: { response: any }) => {
  response.type = "text/html";
  response.body = docHTML;
};

/**
 * Oddiy validation funksiyasi.
 */
function validateUserData(data: any) {
  const errors: string[] = [];

  // firstName
  if (
    !data.firstName || typeof data.firstName !== "string" ||
    !data.firstName.trim()
  ) {
    errors.push("firstName bo‘sh bo‘lmasligi kerak");
  }

  // lastName
  if (
    !data.lastName || typeof data.lastName !== "string" || !data.lastName.trim()
  ) {
    errors.push("lastName bo‘sh bo‘lmasligi kerak");
  }

  // email (oddiy regex misoli)
  if (!data.email || typeof data.email !== "string") {
    errors.push("email bo‘sh yoki noto‘g‘ri tipda");
  } else {
    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!emailRegex.test(data.email)) {
      errors.push("email noto‘g‘ri formatda");
    }
  }

  // password
  if (
    !data.password || typeof data.password !== "string" ||
    data.password.length < 6
  ) {
    errors.push("Parol kamida 6 ta belgidan iborat bo‘lishi kerak");
  }

  // phone
  if (!data.phone || typeof data.phone !== "string" || data.phone.length < 7) {
    errors.push("phone noto‘g‘ri yoki juda qisqa");
  } else {
    const phoneRegex = /^[+0-9]+$/;
    if (!phoneRegex.test(data.phone)) {
      errors.push(
        "phone faqat raqam (va +) belgilaridan iborat bo‘lishi kerak",
      );
    }
  }

  // address
  if (
    !data.address || typeof data.address !== "string" || !data.address.trim()
  ) {
    errors.push("address bo‘sh bo‘lmasligi kerak");
  }

  return errors;
}

/**
 * [POST] /register
 * Foydalanuvchini ro‘yxatdan o‘tkazish.
 */
const registerUser = async (
  { request, response }: { request: any; response: any },
) => {
  try {
    const body = await request.body().value;
    // Validation:
    const errors = validateUserData(body);
    if (errors.length > 0) {
      response.status = 400;
      response.body = { error: "Validation error", details: errors };
      return;
    }

    const { firstName, lastName, email, password, phone, address } = body;

    // Foydalanuvchi mavjud emasligini tekshiramiz
    const existingUser = await kv.get(["users", email]);
    if (existingUser.value) {
      response.status = 400;
      response.body = { error: "Email already exist" };
      return;
    }

    // Parolni bcrypt bilan xeshlash
    const salt = v4.generate();
    const hashedPwd = await bcrypt.hash(password, salt);

    // KV ga saqlash
    await kv.set(["users", email], {
      firstName,
      lastName,
      email,
      password: hashedPwd,
      phone,
      address,
    });

    response.status = 200;
    response.body = { message: "Registration Success" };
  } catch (err) {
    console.error(err);
    response.status = 500;
    response.body = { error: "Internal Server Error" };
  }
};

/**
 * [POST] /login
 * Tizimga kirish (login).
 */
const loginUser = async (
  { request, response }: { request: any; response: any },
) => {
  try {
    const body = await request.body().value;
    const { email, password } = body;

    if (!email || !password) {
      response.status = 400;
      response.body = { error: "Email yoki password yo‘q" };
      return;
    }

    // Foydalanuvchini KV dan olish
    const userRes = await kv.get(["users", email]);
    const user = userRes.value;
    if (!user) {
      response.status = 404;
      response.body = { error: "Email not found" };
      return;
    }

    // Parolni tekshirish
    const validPswd = await bcrypt.compare(password, user.password);
    if (!validPswd) {
      response.status = 401;
      response.body = { error: "Invalid Password" };
      return;
    }

    // Muvaffaqiyatli login
    response.status = 200;
    response.body = { message: "Login Success" };
  } catch (err) {
    console.error(err);
    response.status = 500;
    response.body = { error: "Internal Server Error" };
  }
};

/**
 * [GET] /users
 * Barcha foydalanuvchilarni olish.
 */
const getAllUsers = async ({ response }: { response: any }) => {
  try {
    const allUsers: Array<any> = [];

    // "users" prefixi bilan saqlanganlarni to‘plash
    for await (const entry of kv.list({ prefix: ["users"] })) {
      // Parolni javobdan o‘chirib yuborish:
      const { password, ...rest } = entry.value;
      allUsers.push(rest);
    }

    response.status = 200;
    response.body = allUsers;
  } catch (err) {
    console.error(err);
    response.status = 500;
    response.body = { error: "Internal Server Error" };
  }
};

/**
 * [PUT] /users/:email
 * Foydalanuvchi ma’lumotlarini yangilash.
 * Faqat yuborilgan maydonlargina o‘zgartiriladi (firstName, lastName, password, phone, address).
 */
const updateUser = async (
  { params, request, response }: { params: any; request: any; response: any },
) => {
  try {
    const emailParam = params.email;
    const userGet = await kv.get(["users", emailParam]);
    if (!userGet.value) {
      response.status = 404;
      response.body = { error: "User not found" };
      return;
    }

    const body = await request.body().value;
    const updated = userGet.value;

    // Agar firstName, lastName, phone, address yoki password kelgan bo‘lsa, o‘zgartiramiz:
    if (typeof body.firstName === "string" && body.firstName.trim()) {
      updated.firstName = body.firstName;
    }
    if (typeof body.lastName === "string" && body.lastName.trim()) {
      updated.lastName = body.lastName;
    }
    if (typeof body.phone === "string" && body.phone.trim()) {
      updated.phone = body.phone;
    }
    if (typeof body.address === "string" && body.address.trim()) {
      updated.address = body.address;
    }
    if (typeof body.password === "string" && body.password.length >= 6) {
      const salt = v4.generate();
      const newHashedPwd = await bcrypt.hash(body.password, salt);
      updated.password = newHashedPwd;
    }

    // Yangilangan userni KV ga qayta saqlaymiz
    await kv.set(["users", emailParam], updated);

    response.status = 200;
    response.body = { message: "User updated successfully" };
  } catch (err) {
    console.error(err);
    response.status = 500;
    response.body = { error: "Internal Server Error" };
  }
};

/**
 * [DELETE] /users/:email
 * Foydalanuvchi ma’lumotlarini o‘chirish.
 */
const deleteUser = async (
  { params, response }: { params: any; response: any },
) => {
  try {
    const emailParam = params.email;
    const userGet = await kv.get(["users", emailParam]);
    if (!userGet.value) {
      response.status = 404;
      response.body = { error: "User not found" };
      return;
    }

    // KV dan userni o‘chiramiz
    await kv.delete(["users", emailParam]);

    response.status = 200;
    response.body = { message: "User deleted successfully" };
  } catch (err) {
    console.error(err);
    response.status = 500;
    response.body = { error: "Internal Server Error" };
  }
};

/**
 * Oak Router va Application.
 */
const router = new Router();
router
  .get("/", showDocumentation) // Documentation sahifasi
  .post("/register", registerUser)
  .post("/login", loginUser)
  .get("/users", getAllUsers)
  .put("/users/:email", updateUser)
  .delete("/users/:email", deleteUser);

const app = new Application();
const PORT = 8080;

// CORS ni barcha so‘rovlar uchun yoqamiz:
app.use(
  oakCors({
    origin: "*", // Barcha domenlardan ruxsat berish
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Ruxsat etilgan HTTP metodlar
    // other options if needed
  }),
);

app.use(router.routes());
app.use(router.allowedMethods());

console.log(`Server running on http://localhost:${PORT}/`);
await app.listen({ port: PORT });
