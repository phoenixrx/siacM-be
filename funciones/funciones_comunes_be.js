/**
 * Genera una consulta UPDATE dinámica con múltiples campos actualizables y múltiples condiciones WHERE.
 * 
 * @param {string} table - Nombre de la tabla
 * @param {string[]} allowedFields - Lista de campos permitidos para actualizar
 * @param {Object} body - Datos del cuerpo de la petición (req.body)
 * @param {Object} whereConditions - Objeto con condiciones para el WHERE, ej: { id_usuario: 123, activo: 1 }
 * @returns {{ query: string, values: any[] } | null}
 */

function buildUpdateQuery(table, allowedFields, body, whereConditions) {
  // 1. Filtrar campos permitidos y definidos en el body
  const updateFields = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined && body[field] !== null) {
      updateFields[field] = body[field];
    }
  }

  // Si no hay campos para actualizar, devolver null
  if (Object.keys(updateFields).length === 0) {
    return null;
  }

  // 2. Construir la cláusula SET
  const setClause = Object.keys(updateFields)
    .map(key => `${key} = ?`)
    .join(', ');

  // 3. Construir la cláusula WHERE
  const whereKeys = Object.keys(whereConditions);
  if (whereKeys.length === 0) {
    throw new Error('Debe proporcionarse al menos una condición WHERE');
  }

  const whereClause = whereKeys
    .map(key => `${key} = ?`)
    .join(' AND ');


  const values = [
    ...Object.values(updateFields),
    ...Object.values(whereConditions)
  ];

  const query = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;

  return { query, values };
}

async function generarUUID() {
  const { v4: uuidv4 } = await import('uuid');
  return uuidv4();
}

const mysql = require('mysql2');

const BATCH_SIZE = 1000; 

async function actualizarUUIDs(id_tabla, tabla, uuid_field) {
    console.log('Iniciando actualización de UUIDs...');

    const connection = mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
     const connectionPromise = connection.promise();

     try {

        let [result] = await connectionPromise.query(
            `SELECT MAX(${id_tabla}) as max_id_con_uuid FROM ${tabla} WHERE ${uuid_field} IS NOT NULL`
        );
        let ultimoIdProcesado = result[0].max_id_con_uuid || 0; // Si no hay ninguno, empieza desde 0
        console.log(`Ultimo ID con UUID: ${ultimoIdProcesado}`);

        // Obtener el total de registros que necesitan UUID *desde el último procesado*
        [result] = await connectionPromise.query(
            `SELECT COUNT(*) as total FROM ${tabla} WHERE ${uuid_field} IS NULL AND ${id_tabla} > ?`,
            [ultimoIdProcesado]
        );
        const totalRows = result[0].total;
        console.log(`Total de registros sin UUID desde ID ${ultimoIdProcesado + 1}: ${totalRows}`);

        let totalProcesados = 0;

        let rows;
        do {
            console.log(`Procesando lote a partir del ID ${ultimoIdProcesado + 1}...`);

            // 1. Seleccionar un bloque de pacientes sin UUID, con ID mayor al último procesado
            [rows] = await connectionPromise.query(
                `SELECT ${id_tabla} FROM ${tabla} WHERE ${uuid_field} IS NULL AND ${id_tabla} > ? ORDER BY ${id_tabla} ASC LIMIT ?`,
                [ultimoIdProcesado, BATCH_SIZE]
            );

            if (rows.length === 0) {
                console.log('No hay más registros para procesar.');
                break; // No hay más filas
            }

            // 2. Generar la consulta de actualización masiva, generando un UUID para cada fila aquí mismo
            let sqlUpdate = `UPDATE ${tabla} SET ${uuid_field} = CASE ${id_tabla} `;
            const params = [];

            // Iterar sobre cada fila del lote
            for (const row of rows) {                
                const uuid = await generarUUID(); // Generar UUID individual

                sqlUpdate += 'WHEN ? THEN ? ';
                params.push(row[id_tabla], uuid);
            }

            sqlUpdate += `END WHERE ${id_tabla} IN (` + rows.map(() => '?').join(',') + ')';

            // Agregar los IDs al final de los parámetros
            params.push(...rows.map(row => row.id_paciente));


            await connectionPromise.query(sqlUpdate, params);

            ultimoIdProcesado = rows[rows.length - 1][id_tabla];
            totalProcesados += rows.length;
            console.log(`Procesados ${totalProcesados} registros en esta ejecución...`);

        } while (rows.length === BATCH_SIZE); // Continuar mientras el lote esté lleno

        console.log('Actualización de UUIDs completada (o pausada para continuar después).');

    } catch (error) {
        console.error('Error durante la actualización de UUIDs:', error);
    } finally {
        connection.end(); // Cerrar la conexión
    }
}

module.exports = { buildUpdateQuery, generarUUID, actualizarUUIDs };