const jwt = require("jsonwebtoken");

const bcrypt = require("bcryptjs");
const pool = require("./db");
const user_query = `SELECT 
                        u.*,
                        pub.*,
                        gu.id_grupo_usuario,
                        gu.descripcion as grupo_u,
                        pue.id_usuario_empresa as id_cli,
                        pue.fecha_valido as fecha_vencimiento,
                        pue.logo_empresa,
                        pue.logo2_empresa,
                        pue.id_plan,
                        CASE
                            WHEN cu.id_caja IS NULL OR cu.id_caja = 0 OR cu.id_caja = '' THEN MIN(c.id)
                            ELSE cu.id_caja
                        END as caja_usuario
                    FROM usuarios u
                    INNER JOIN grupos_usuarios_det gud ON gud.id_usuario = u.id
                    INNER JOIN grupos_usuarios gu ON gu.id_grupo_usuario = gud.id_grupo_usuario
                    INNER JOIN perfil_usuario_basico pub ON pub.id_usuario = u.id
                    INNER JOIN perfil_usuario_empresa pue ON pue.id_usuario_empresa = pub.id_usuario_empresa
                    LEFT JOIN caja_usuarios cu ON cu.id_usuario = u.id
                    LEFT JOIN cajas c ON c.id_cli = pub.id_usuario_empresa
                    WHERE u.usuario =?`;                        

const generateToken = (user) => {
  try {
    const { contrasena, ...userWithoutPassword } = user;
    return jwt.sign(
      { ...userWithoutPassword },
      process.env.JWT_SECRET,
      { expiresIn: "10h" }
    );
  } catch (error) {
    
  }
  
};

// Verificar credenciales locales
const authenticateLocal = async (usuario, password,ip_internet,ip_local) => {
  const [rows] = await pool.query(user_query, [usuario]);
  
  if (rows.length === 0) throw new Error("Usuario no encontrado");
  const user = rows[0];
  if(user.id===null) throw new Error("Usuario no encontrado");
  user.ip_internet = ip_internet;
  user.ip_local = ip_local;
  
  const isValidPassword = await bcrypt.compare(password, user.contrasena);

  if (!isValidPassword) throw new Error("Contraseña incorrecta");
  
  const [permisos] = await pool.query(`SELECT * FROM permisos WHERE id_usuario=${user.id_grupo_usuario}`);
  user.contrasena ='';
  user.permisos = permisos;

  return user;
};

const retornar_query = async (query, ids) => {
  try {
    const [rows] = await pool.query(query, ids);

    if (rows.length === 0) { 
      return { error: "no data" }
    
    };
    const resultado = rows;
    return resultado;
  } catch (error) {
    return error
  } 
};

const retornarQuery = async (query, params = []) => {
  
  if (!query || typeof query !== 'string') {
    return { error: 'Query inválida o no proporcionada' };
  }

  try {
    const [rows] = await pool.query(query, params);
    if (rows.length === 0) {
      return { data: [], message: 'No se encontraron resultados' };
    }

    return { data: rows };
  } catch (error) {    
    return { 
      error: error.message, 
      details: error 
    };
  }
};

const ejecutarTransaccion = async (consultas = []) => {
  if (!Array.isArray(consultas) || consultas.length === 0) {
    return { error: 'Debe proporcionar un array de consultas' };
  }

  let connection;
  try {
    // Obtener una conexión del pool
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const resultados = [];

    for (const { query, params = [] } of consultas) {
      if (!query || typeof query !== 'string') {
        throw new Error('Consulta inválida detectada en la transacción');
      }

      const [result] = await connection.query(query, params);
      resultados.push(result);
    }

    await connection.commit();

    return {
      success: true,
      data: resultados,
    };

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    
    return {
      success: false,
      error: error.message,
      details: error ,
    };
  } finally {
    if (connection) {
      connection.release();
    }
  }
};
// Verificar usuario de Google
const authenticateGoogle = async (email) => {
  const [rows] = await pool.query("SELECT * FROM usuarios WHERE correoe = ?", [
    email,
  ]);
  if (rows.length === 0) throw new Error("Usuario no registrado");
  return rows[0];
};


module.exports = { generateToken, authenticateLocal, authenticateGoogle, retornar_query, retornarQuery, ejecutarTransaccion };
