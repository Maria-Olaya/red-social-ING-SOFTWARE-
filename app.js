// Importa las librerías necesarias
const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const session = require('express-session');
const multer = require('multer'); // Para manejar la subida de archivos
const fs = require('fs');

const app = express();
const PORT = 3000;

// Configura la conexión a la base de datos
const conexion = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '7019./Gto',
    database: 'magneto'
});

// Middleware para servir archivos estáticos desde la carpeta 'public'
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json()); // Añadido para manejar JSON
// Middleware para manejar sesiones
app.use(session({
    secret: 'tu_secreto',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Configuración de multer para almacenar archivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, 'public/uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage: storage });

// Conéctate a la base de datos
conexion.connect((err) => {
    if (err) {
        console.error('Error de conexión:', err);
        return;
    }
    console.log('Conexión exitosa a la base de datos.');
});

// Ruta para la página de inicio
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta para registrar usuario
app.post('/register', (req, res) => {
    const { nombre, nombre_usuario, correo_electronico, contrasena, fecha_nacimiento, genero } = req.body;

    bcrypt.hash(contrasena, 10, (err, hash) => {
        if (err) {
            console.error('Error al encriptar la contraseña:', err);
            return res.status(500).send('Error al registrar el usuario');
        }

        const query = 'INSERT INTO Usuarios (nombre, nombre_usuario, correo_electronico, contraseña, fecha_nacimiento, genero) VALUES (?, ?, ?, ?, ?, ?)';
        conexion.query(query, [nombre, nombre_usuario, correo_electronico, hash, fecha_nacimiento, genero], (err, results) => {
            if (err) {
                console.error('Error al registrar el usuario:', err);
                return res.status(500).send('Error al registrar el usuario');
            }
            res.redirect('/index.html'); 
        });
    });
});

// Ruta para inicio de sesión
app.post('/login', (req, res) => {
    const { nombre_usuario, contrasena } = req.body;

    const query = 'SELECT * FROM Usuarios WHERE nombre_usuario = ?';
    conexion.query(query, [nombre_usuario], (err, results) => {
        if (err) {
            console.error('Error al iniciar sesión:', err);
            res.status(500).send('Error al iniciar sesión');
            return;
        }

        if (results.length > 0) {
            const user = results[0];

            bcrypt.compare(contrasena, user.contraseña, (err, isMatch) => {
                if (err) {
                    console.error('Error al comparar contraseñas:', err);
                    res.status(500).send('Error al iniciar sesión');
                    return;
                }

                if (isMatch) {
                    req.session.userId = user.id;
                    res.redirect('/feed.html');
                } else {
                    res.send('Credenciales incorrectas');
                }
            });
        } else {
            res.send('Credenciales incorrectas');
        }
    });
});

// Ruta para subir publicaciones
app.post('/upload', upload.single('archivo'), (req, res) => {
    const contenido = req.body.contenido;
    const archivo = req.file ? `/uploads/${req.file.filename}` : null;
    const usuarioId = req.session.userId;

    if (!usuarioId) {
        return res.status(401).json({ success: false, message: 'No estás autorizado para subir publicaciones.' });
    }

    const query = 'INSERT INTO Publicaciones (usuario_id, contenido, archivo) VALUES (?, ?, ?)';
    conexion.query(query, [usuarioId, contenido, archivo], (err, results) => {
        if (err) {
            console.error('Error al subir la publicación:', err);
            return res.status(500).json({ success: false, message: 'Error al subir la publicación.' });
        }
        res.json({ success: true, message: 'Publicación subida con éxito' });
    });
});

// Ruta para obtener y mostrar las publicaciones en el feed
app.get('/feed', (req, res) => {
    const query = `
        SELECT Publicaciones.id, Publicaciones.contenido, Publicaciones.archivo, Publicaciones.fecha_publicacion, 
               Usuarios.nombre_usuario, Usuarios.foto_perfil 
        FROM Publicaciones 
        JOIN Usuarios ON Publicaciones.usuario_id = Usuarios.id 
        ORDER BY Publicaciones.fecha_publicacion DESC
    `;

    conexion.query(query, (err, results) => {
        if (err) {
            console.error('Error al obtener las publicaciones:', err);
            return res.status(500).send('Error al obtener las publicaciones.');
        }
        res.json(results); // Envía las publicaciones en formato JSON
    });
});

// Ruta para obtener comentarios de una publicación específica
app.get('/comentarios/:id', (req, res) => {
    const publicacionId = req.params.id; // Obtiene el id de la publicación desde la URL

    const query = `
        SELECT Comentarios.contenido, Comentarios.fecha_comentario, Usuarios.nombre_usuario 
        FROM Comentarios 
        JOIN Usuarios ON Comentarios.usuario_id = Usuarios.id
        WHERE Comentarios.publicacion_id = ?
        ORDER BY Comentarios.fecha_comentario DESC
    `;

    conexion.query(query, [publicacionId], (err, results) => {
        if (err) {
            console.error('Error al obtener los comentarios:', err);
            return res.status(500).send('Error al obtener los comentarios.');
        }
        res.json(results); // Envía los comentarios en formato JSON
    });
});


// Ruta para agregar un comentario
// Ruta para agregar un comentario
app.post('/comentario', (req, res) => {
    const { publicacion_id, contenido } = req.body; // Asegúrate de que estás recibiendo 'publicacion_id' correctamente
    const usuarioId = req.session.userId;

    if (!usuarioId) {
        return res.status(401).json({ success: false, message: 'No estás autorizado para comentar.' });
    }

    const query = 'INSERT INTO Comentarios (publicacion_id, usuario_id, contenido) VALUES (?, ?, ?)';
    conexion.query(query, [publicacion_id, usuarioId, contenido], (err, results) => {
        if (err) {
            console.error('Error al agregar el comentario:', err);
            return res.status(500).json({ success: false, message: 'Error al agregar el comentario.' });
        }
        res.json({ success: true, message: 'Comentario agregado con éxito' });
    });
});


// Ruta para obtener todos los comentarios
app.get('/comentarios', (req, res) => {
    const query = `
        SELECT Comentarios.contenido, Comentarios.fecha_comentario, Comentarios.usuario_id 
        FROM Comentarios 
        ORDER BY Comentarios.fecha_comentario DESC
    `;

    conexion.query(query, (err, results) => {
        if (err) {
            console.error('Error al obtener los comentarios:', err);
            return res.status(500).send('Error al obtener los comentarios.');
        }
        res.json(results); // Envía los comentarios en formato JSON
    });
});

// Ruta para agregar una valoración
app.post('/valoracion', (req, res) => {
    const { publicacion_id, tipo_reaccion } = req.body;
    const usuarioId = req.session.userId;

    if (!usuarioId) {
        return res.status(401).json({ success: false, message: 'No estás autorizado para valorar.' });
    }

    const query = 'INSERT INTO Valoraciones (publicacion_id, usuario_id, tipo_reaccion) VALUES (?, ?, ?)';
    conexion.query(query, [publicacion_id, usuarioId, tipo_reaccion], (err, results) => {
        if (err) {
            console.error('Error al agregar la valoración:', err);
            return res.status(500).json({ success: false, message: 'Error al agregar la valoración.' });
        }
        res.json({ success: true, message: 'Valoración agregada con éxito' });
    });
});




// Ruta para subir historias
app.post('/subir-historia', upload.single('archivo'), (req, res) => {
    const contenido = req.body.contenido;
    const archivo = req.file ? `/uploads/${req.file.filename}` : null;
    const usuarioId = req.session.userId;

    if (!usuarioId) {
        return res.status(401).json({ success: false, message: 'No estás autorizado para subir historias.' });
    }

    const query = 'INSERT INTO Historias (usuario_id, contenido, archivo) VALUES (?, ?, ?)';
    conexion.query(query, [usuarioId, contenido, archivo], (err, results) => {
        if (err) {
            console.error('Error al subir la historia:', err);
            return res.status(500).json({ success: false, message: 'Error al subir la historia.' });
        }
        res.json({ success: true, message: 'Historia subida con éxito' });
    });
});




// Ruta para obtener todas las historias
app.get('/historias', (req, res) => {
    const query = `
        SELECT Historias.id, Historias.contenido, Historias.archivo, Historias.fecha_subida, 
               Usuarios.nombre_usuario 
        FROM Historias 
        JOIN Usuarios ON Historias.usuario_id = Usuarios.id 
        ORDER BY Historias.fecha_subida DESC
    `;

    conexion.query(query, (err, results) => {
        if (err) {
            console.error('Error al obtener las historias:', err);
            return res.status(500).send('Error al obtener las historias.');
        }
        res.json(results); // Envía las historias en formato JSON
    });
});

// Ruta para obtener todos los retos
app.get('/retos', (req, res) => {
    const query = `
        SELECT Retos.contenido, Retos.fecha_publicacion, 
               Usuarios.nombre_usuario, Retos.id, Retos.archivo 
        FROM Retos 
        JOIN Usuarios ON Retos.usuario_id = Usuarios.id 
        ORDER BY Retos.fecha_publicacion DESC
    `;

    conexion.query(query, (err, results) => {
        if (err) {
            console.error('Error al obtener los retos:', err);
            return res.status(500).send('Error al obtener los retos.');
        }
        res.json(results); // Envía los retos en formato JSON
    });
});
// Ruta para subir retos
app.post('/upload_reto', upload.single('archivo'), (req, res) => {
    const contenido = req.body.contenido;
    const archivo = req.file ? `/uploads/${req.file.filename}` : null;
    const usuarioId = req.session.userId;

    if (!usuarioId) {
        return res.status(401).json({ success: false, message: 'No estás autorizado para subir retos.' });
    }

    const query = 'INSERT INTO Retos (usuario_id, contenido, archivo) VALUES (?, ?, ?)';
    conexion.query(query, [usuarioId, contenido, archivo], (err, results) => {
        if (err) {
            console.error('Error al subir el reto:', err);
            return res.status(500).json({ success: false, message: 'Error al subir el reto.' });
        }
        res.json({ success: true, message: 'Reto subido con éxito' });
    });
});

// Ruta para agregar una respuesta a un reto
app.post('/upload_respuesta', upload.single('archivo'), (req, res) => {
    const retoId = req.body.reto_id;
    const contenido = req.body.contenido;
    const archivo = req.file ? `/uploads/${req.file.filename}` : null;
    const usuarioId = req.session.userId;

    if (!usuarioId) {
        return res.status(401).json({ success: false, message: 'No estás autorizado para subir respuestas.' });
    }

    const query = 'INSERT INTO Respuestas (reto_id, usuario_id, fecha_respuesta, contenido, archivo) VALUES (?, ?, NOW(), ?, ?)';
    conexion.query(query, [retoId, usuarioId, contenido, archivo], (err, results) => {
        if (err) {
            console.error('Error al subir la respuesta:', err);
            return res.status(500).json({ success: false, message: 'Error al subir la respuesta.' });
        }
        res.json({ success: true, message: 'Respuesta subida con éxito' });
    });
});



// Ruta para obtener las respuestas de un reto específico
app.get('/respuestas/:retoId', (req, res) => {
    const retoId = req.params.retoId; // Obtiene el id del reto desde la URL

    const query = `
        SELECT Respuestas.contenido, Respuestas.fecha_respuesta, Usuarios.nombre_usuario 
        FROM Respuestas 
        JOIN Usuarios ON Respuestas.usuario_id = Usuarios.id
        WHERE Respuestas.reto_id = ?
        ORDER BY Respuestas.fecha_respuesta DESC
    `;

    conexion.query(query, [retoId], (err, results) => {
        if (err) {
            console.error('Error al obtener las respuestas:', err);
            return res.status(500).send('Error al obtener las respuestas.');
        }
        res.json(results); // Envía las respuestas en formato JSON
    });
});

// Ruta para agregar una respuesta a un reto
app.post('/upload_respuesta', upload.single('archivo'), (req, res) => {
    const retoId = req.body.reto_id;
    const contenido = req.body.contenido;
    const archivo = req.file ? `/uploads/${req.file.filename}` : null;
    const usuarioId = req.session.userId;

    if (!usuarioId) {
        return res.status(401).json({ success: false, message: 'No estás autorizado para subir respuestas.' });
    }

    const query = 'INSERT INTO Respuestas (reto_id, usuario_id, fecha_respuesta, contenido, archivo) VALUES (?, ?, NOW(), ?, ?)';
    conexion.query(query, [retoId, usuarioId, contenido, archivo], (err, results) => {
        if (err) {
            console.error('Error al subir la respuesta:', err);
            return res.status(500).json({ success: false, message: 'Error al subir la respuesta.' });
        }
        res.json({ success: true, message: 'Respuesta subida con éxito' });
    });
});
app.post('/reaccion', (req, res) => {
    const { publicacion_id, tipo_reaccion } = req.body;
    const usuario_id = req.session.userId; // O la forma en que obtienes el ID del usuario

    // Lista de tipos de reacción válidos
    const tiposValidos = ['me gusta', 'me encanta', 'me sorprende', 'me enoja', 'me entristece'];

    // Verificar si el tipo de reacción es válido
    if (!tiposValidos.includes(tipo_reaccion)) {
        return res.status(400).json({ success: false, message: 'Tipo de reacción no válido' });
    }

    // Verificar si ya existe una reacción del usuario para esta publicación
    conexion.query('SELECT * FROM valoraciones WHERE publicacion_id = ? AND usuario_id = ?', [publicacion_id, usuario_id], (err, results) => {
        if (err) {
            console.error('Error en la base de datos:', err); // Añade esta línea para depuración
            return res.status(500).json({ success: false, message: 'Error en la base de datos' });
        }

        if (results.length > 0) {
            // Si ya existe, actualizamos la reacción
            conexion.query('UPDATE valoraciones SET tipo_reaccion = ? WHERE publicacion_id = ? AND usuario_id = ?', [tipo_reaccion, publicacion_id, usuario_id], (err) => {
                if (err) {
                    console.error('Error al actualizar la reacción:', err); // Añade esta línea para depuración
                    return res.status(500).json({ success: false, message: 'Error al actualizar la reacción' });
                }
                return res.json({ success: true, message: 'Reacción actualizada' });
            });
        } else {
            // Si no existe, insertamos una nueva reacción
            conexion.query('INSERT INTO valoraciones (publicacion_id, usuario_id, tipo_reaccion, fecha_reaccion) VALUES (?, ?, ?, NOW())', [publicacion_id, usuario_id, tipo_reaccion], (err) => {
                if (err) {
                    console.error('Error al guardar la reacción:', err); // Añade esta línea para depuración
                    return res.status(500).json({ success: false, message: 'Error al guardar la reacción' });
                }
                return res.json({ success: true, message: 'Reacción guardada' });
            });
        }
    });
});


// Ruta para obtener la reacción del usuario a una publicación
app.get('/reaccion/:postId', (req, res) => {
    const postId = req.params.postId;
    const usuario_id = req.session.userId; // O la forma en que obtienes el ID del usuario

    conexion.query('SELECT tipo_reaccion FROM valoraciones WHERE publicacion_id = ? AND usuario_id = ?', [postId, usuario_id], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Error en la base de datos' });
        
        if (results.length > 0) {
            return res.json({ reaccion: results[0].tipo_reaccion });
        } else {
            return res.json({ reaccion: 'Ninguna' }); // O puedes devolver null
        }
    });
});



// Inicia el servidor
app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
