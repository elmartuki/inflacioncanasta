const express = require("express");
const mysql = require("mysql2");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
const bcrypt = require("bcrypt");
const app = express();
const cors = require("cors");
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
const https = require("https");
const http = require("http");

app.use(express.json());

// justo después de `const cors = require('cors');`
const allowedOrigins = [
  "https://inflacioncanasta.netlify.app",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "https://inflacioncanasta.ddns.net",
  "https://localhost:4000",
];

// Leer los certificados
const sslOptions = {
  key: fs.readFileSync("./ssl/inflacioncanasta.ddns.net-key.pem"),
  cert: fs.readFileSync("./ssl/inflacioncanasta.ddns.net-crt.pem"),
  ca: fs.readFileSync("./ssl/inflacioncanasta.ddns.net-chain.pem"), // opcional pero recomendable
};

app.use(
  cors({
    origin: function (origin, callback) {
      // permitir peticiones sin origen (Postman/CURL) o que estén en la lista
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error("Origen no permitido por CORS: " + origin));
    },
    credentials: true,
  })
);

const multer = require("multer");
const csv = require("csv-parser");

const upload = multer({ dest: "uploads/" });

app.post("/importar-csv", upload.single("csv"), (req, res) => {
  const resultados = [];

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on("data", (data) => resultados.push(data))
    .on("end", () => {
      fs.unlinkSync(req.file.path); // borrar archivo temporal

      const values = resultados.map((r) => [
        r.nombre?.trim() || "",
        parseFloat(r.precio_hoy) || 0,
        parseFloat(r.precio_7dias) || 0,
        parseFloat(r.precio_14dias) || 0,
        parseFloat(r.precio_21dias) || 0,
        parseFloat(r.precio_28dias) || 0,
        parseFloat(r.precio_historico) || 0,
      ]);

      if (values.length === 0) {
        return res
          .status(400)
          .send("El archivo CSV está vacío o mal formateado");
      }

      const insertQuery = `
  INSERT INTO inflacion (nombre, precio_hoy, precio_7dias, precio_14dias, precio_21dias, precio_28dias, precio_historico)
  VALUES ?
`;

      db.query(insertQuery, [values], (err) => {
        if (err) {
          console.error("❌ Error al importar CSV:", err);
          return res.status(500).send("Error al importar CSV");
        }
        res.send("✅ Archivo CSV importado correctamente");
      });
    });
});

app.delete("/inflacion/:id", (req, res) => {
  const id = req.params.id;
  const query = "DELETE FROM inflacion WHERE id = ?";

  db.query(query, [id], (err, result) => {
    if (err) {
      console.error("❌ Error al eliminar producto:", err);
      return res.status(500).send("Error al eliminar producto");
    }
    res.send("✅ Producto eliminado correctamente");
  });
});

// Conexión a MySQL
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "120723", // coloca tu contraseña si tienes una
  database: "productos",
});

// Verificación de conexión
db.connect((err) => {
  if (err) {
    console.error("Error de conexión a la base de datos:", err);
    return;
  }
  console.log("Conectado a la base de datos MySQL");
});

// Obtener todos los productos
app.get("/inflacion", (req, res) => {
  db.query("SELECT * FROM inflacion", (err, resultados) => {
    if (err) return res.status(500).send(err);
    res.json(resultados);
  });
});

app.post("/desplazar", (req, res) => {
  const query = `
    UPDATE inflacion SET
      precio_21dias = precio_14dias,
      precio_14dias = precio_7dias,
      precio_7dias = precio_hoy
  `;
  db.query(query, (err) => {
    if (err) {
      console.error("❌ Error al desplazar los precios:", err);
      return res.status(500).send("Error al desplazar los precios");
    }
    res.send("✅ Precios desplazados correctamente");
  });
});

// Agregar nuevo producto
app.post("/inflacion", (req, res) => {
  const {
    nombre,
    precio_hoy,
    precio_7dias,
    precio_14dias,
    precio_21dias,
    precio_28dias,
    precio_historico,
  } = req.body;
  const sql =
    "INSERT INTO inflacion (nombre, precio_hoy, precio_7dias, precio_14dias, precio_21dias, precio_28dias, precio_historico) VALUES (?, ?, ?, ?, ?, ?, ?)";
  db.query(
    sql,
    [
      nombre,
      precio_hoy,
      precio_7dias,
      precio_14dias,
      precio_21dias,
      precio_28dias,
      precio_historico,
    ],
    (err, result) => {
      if (err) {
        console.error("Error al insertar producto:", err); // 💥 esto mostrará el error real
        return res.status(500).json({ error: "Error al guardar producto" });
      }
      res.status(200).json({ mensaje: "Producto guardado con éxito" });
    }
  );
});

// Editar producto existente
app.put("/inflacion/:id", (req, res) => {
  const { id } = req.params;
  const {
    nombre,
    precio_hoy,
    precio_7dias,
    precio_14dias,
    precio_21dias,
    precio_28dias,
    precio_historico,
  } = req.body;

  const sql = `UPDATE inflacion SET 
nombre = ?, precio_hoy = ?, precio_7dias = ?, precio_14dias = ?, precio_21dias = ?, precio_28dias = ?, precio_historico = ?
WHERE id = ?`;

  db.query(
    sql,
    [
      nombre,
      precio_hoy,
      precio_7dias,
      precio_14dias,
      precio_21dias,
      precio_28dias,
      precio_historico,
      id,
    ],
    (err, resultado) => {
      if (err) return res.status(500).send(err);
      res.send("Producto actualizado");
    }
  );
});

// 📦 Parsear body JSON y formularios
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🔐 Configurar sesión con cookie segura
app.use(
  session({
    secret: "clave-secreta",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      maxAge: 2 * 60 * 1000, // 2 minutos
      sameSite: "none",
      secure: true,
    },
  })
);

// ✅ Ruta de login con redirección por JSON
app.post("/login", (req, res) => {
  const { usuario, password } = req.body;

  db.query(
    "SELECT * FROM admins WHERE usuario = ? AND password = ?",
    [usuario, password],
    (err, result) => {
      if (err) {
        console.error("❌ ERROR EN CONSULTA MYSQL:", err);
        return res
          .status(500)
          .json({ success: false, error: "Error en base de datos" });
      }

      if (result.length > 0) {
        req.session.usuario = "admin";
        return res.json({
          success: true,
          redirect: "https://inflacioncanasta.ddns.net/formulario.html",
        });
      } else {
        return res
          .status(401)
          .json({ success: false, error: "Credenciales inválidas" });
      }
    }
  );
});

// 🔒 Ruta protegida para verificar sesión desde JS
app.get("/verificar-sesion", (req, res) => {
  if (req.session && req.session.usuario === "admin") {
    res.sendStatus(200);
  } else {
    res.sendStatus(401);
  }
});

// 🔐 Cerrar sesión
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.send("Sesión cerrada");
  });
});

app.get("/semanas", (req, res) => {
  db.query("SELECT * FROM inflacion_semanal ORDER BY id ASC", (err, rows) => {
    if (err) return res.status(500).send(err);
    res.json(rows);
  });
});

app.post("/semanas", (req, res) => {
  const { semana, variacion } = req.body;
  console.log("📩 Semana recibida:", semana, variacion); // ← esto
  const query =
    "INSERT INTO inflacion_semanal (semana, variacion) VALUES (?, ?)";
  db.query(query, [semana, variacion], (err) => {
    if (err) return res.status(500).send(err);
    res.send("Semana agregada correctamente");
  });
});

app.put("/semanas/:id", (req, res) => {
  const { id } = req.params;
  const { semana, variacion } = req.body;
  const query =
    "UPDATE inflacion_semanal SET semana = ?, variacion = ? WHERE id = ?";
  db.query(query, [semana, variacion, id], (err) => {
    if (err) return res.status(500).send(err);
    res.send("Semana actualizada");
  });
});

app.delete("/semanas/:id", (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM inflacion_semanal WHERE id = ?", [id], (err) => {
    if (err) return res.status(500).send(err);
    res.send("Semana eliminada");
  });
});

https.createServer(sslOptions, app).listen(4000, () => {
  console.log("✅ Servidor HTTPS en https://inflacioncanasta.ddns.net:4000");
});

// // // // Iniciar el servidor
// app.listen(4000, "0.0.0.0", () => {
//   console.log("Servidor corriendo en el puerto 4000");
// });
