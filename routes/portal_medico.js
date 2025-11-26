// routes/portal_medico.js
const express = require('express');
const router = express.Router();
const { retornar_query, retornarQuery } = require('../auth');
const { authenticateToken, registrarErrorPeticion } = require('../middlewares/autenticarToken');
const { buildUpdateQuery } = require('../funciones/funciones_comunes_be');

// GET /api/portal_medico
router.get('/listado-pacientes', async (req, res) => {
    const {id_cli, id_med, fechaInicio, fechaFin} = req.query;
    try {
        const query = `
            SELECT 
                a.id_estado_admision,
                a.id_admision, 
                a.fecha_admision,
                a.fecha_creacion,
                ad.id_medico, 
                a.tipo_consulta,
                CASE
                    WHEN a.tipo_consulta = 'S' THEN 'SEGURO'
                    WHEN a.tipo_consulta = 'E' THEN 'EMPRESA'
                    WHEN a.tipo_consulta = 'P' THEN 'PARTICULAR'
                    WHEN a.tipo_consulta = 'I' THEN 'INTERNO'  
                END AS TipoConsulta,
                CONCAT(p.nombres, ' ', p.apellidos) AS paciente, 
                CONCAT(p.tipo_cedula, '-', p.cedula) AS cedula, 
                a.edad,
                MAX(ad.id_admidet) AS id_admidet,
                CASE 
                    WHEN a.turno IS NULL THEN 999
                    ELSE a.turno 
                END AS turno,
                CASE
                    WHEN a.id_estado_admision = 1 THEN 'En espera'
                    WHEN a.id_estado_admision = 2 THEN 'Llamado'
                    WHEN a.id_estado_admision = 3 THEN 'Atendido'
                    WHEN a.id_estado_admision = 4 THEN 'Cancelado'                     
                END AS Estado,
                CASE
                    WHEN a.id_estado_admision = 1 THEN 4
                    WHEN a.id_estado_admision = 2 THEN 7
                    WHEN a.id_estado_admision = 3 THEN 8
                    WHEN a.id_estado_admision = 4 THEN 1                    
                END AS clase_color_code
            FROM
                admisiones a
            INNER JOIN
                admisiones_det ad ON a.id_admision = ad.id_admision
            INNER JOIN
                pacientes p ON a.id_paciente = p.id_paciente
            WHERE
                a.id_estado_admision IN (1,2,3,4) 
                AND ad.id_medico = ?
                AND a.id_cli = ?
                AND a.solo_ppto = 0 
                AND ad.activo = 1 
                AND a.activo = 1     
                AND a.fecha_admision BETWEEN ? AND CONCAT(?, ' 23:59:59') 
            GROUP BY 
                a.id_admision, 
                a.id_estado_admision, 
                a.fecha_admision, 
                a.fecha_creacion, 
                ad.id_medico, 
                a.tipo_consulta, 
                p.nombres, 
                p.apellidos, 
                p.tipo_cedula, 
                p.cedula, 
                a.edad, 
                a.turno
            ORDER BY 
                turno, 
                a.id_admision
        `;
        
        const listado = await retornar_query(query,[id_med, id_cli, fechaInicio, fechaFin]);
        
        if (!Array.isArray(listado)) {            
            return res.json({
                success: false,
                error: 'Error interno al procesar los presupuestos.',
                listado
            });
        }
        
        return res.json({
            success: true,
            data: listado
        });
    } catch (error) { registrarErrorPeticion(req, error);       
        return res.status(400).json({
            success: false,
            error: 'Error al obtener el listado',
            details: error
        });
    }
});

router.post('/evoluciones/:id_cli', authenticateToken, async (req, res) => {
  const { id_cli } = req.params;
  const {
    id_paciente,
    id_consulta,
    id_med,
    tipo_evolucion,
    motivo,
    estado_paciente,
    hallazgos,
    resultados_estudios,
    plan,
    notas_adicionales,
    signos_vitales  // opcional: { presion_arterial, frec_cardiaca, ... }
  } = req.body;

  // Validaciones básicas
  if (!id_cli || isNaN(id_cli)) {
    return res.status(400).json({ success: false, error: 'id_cli inválido' });
  }
  if (!id_paciente || isNaN(id_paciente)) {
    return res.status(400).json({ success: false, error: 'id_paciente es obligatorio y debe ser numérico' });
  }
  if (!id_med || isNaN(id_med)) {
    return res.status(400).json({ success: false, error: 'id_med es obligatorio y debe ser numérico' });
  }
  if (!tipo_evolucion || isNaN(tipo_evolucion)) {
    return res.status(400).json({ success: false, error: 'tipo_evolucion es obligatorio' });
  }
  const estadosValidos = ['estable', 'mejoria', 'estacionario', 'empeoramiento', 'critico'];
  if (!estadosValidos.includes(estado_paciente)) {
    return res.status(400).json({ success: false, error: 'estado_paciente no válido' });
  }

  let id_dato_enfermeria = null;

  try {
    // 1. Si se envían signos_vitales, crear registro en datos_enfermeria
    if (signos_vitales && Object.keys(signos_vitales).length > 0) {
      const {
        presion_arterial,
        frec_cardiaca,
        frec_respiratoria,
        temperatura,
        sat_oxigeno
      } = signos_vitales;

      const queryEnf = `
        INSERT INTO datos_enfermeria (
          id_paciente, id_cli, id_usuario, proc_reg,
          presion_arterial, frec_cardiaca, frec_respiratoria, temperatura, sat_oxigeno,
          fecha_hora
        ) VALUES (?, ?, ?, 'Evolucion', ?, ?, ?, ?, ?, NOW())
      `;
      const paramsEnf = [
        id_paciente, id_cli, id_med,
        presion_arterial || null,
        frec_cardiaca ? parseInt(frec_cardiaca, 10) : null,
        frec_respiratoria ? parseInt(frec_respiratoria, 10) : null,
        temperatura ? parseFloat(temperatura) : null,
        sat_oxigeno ? parseInt(sat_oxigeno, 10) : null
      ];

      const resultEnf = await retornarQuery(queryEnf, paramsEnf);
      if (resultEnf.error) throw new Error('Error al registrar signos vitales');

      id_dato_enfermeria = resultEnf.insertId;
    }

    // 2. Insertar evolución
    const queryEvol = `
      INSERT INTO evoluciones (
        id_paciente, id_consulta, id_med, id_cli, id_dato_enfermeria,
        fecha_hora, tipo_evolucion, motivo, estado_paciente,
        hallazgos, resultados_estudios, plan, notas_adicionales,
        firmada
      ) VALUES (?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, FALSE)
    `;

    const paramsEvol = [
      id_paciente,
      id_consulta || null,
      id_med,
      id_cli,
      id_dato_enfermeria,
      tipo_evolucion,
      motivo || null,
      estado_paciente,
      hallazgos || null,
      resultados_estudios || null,
      plan || null,
      notas_adicionales || null
    ];

    const resultEvol = await retornarQuery(queryEvol, paramsEvol);
    if (resultEvol.error) throw new Error('Error al crear evolución');

    return res.json({
      success: true,
      datos: { id_evolucion: resultEvol.insertId, id_dato_enfermeria }
    });

  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/evoluciones/paciente/:id_paciente', authenticateToken, async (req, res) => {
  const { id_paciente } = req.params;

  if (!id_paciente || isNaN(id_paciente)) {
    return res.status(400).json({ success: false, error: 'id_paciente inválido' });
  }

  const query = `
    SELECT 
      e.id_evolucion,
      e.id_paciente,
      e.id_consulta,
      e.id_med,
      e.id_cli,
      e.id_dato_enfermeria,
      e.fecha_hora,
      e.tipo_evolucion,
      e.motivo,
      e.estado_paciente,
      e.hallazgos,
      e.resultados_estudios,
      e.plan,
      e.notas_adicionales,
      e.firmada,
      e.fecha_firma,
      t.nombre AS tipo_evolucion_nombre,
      CONCAT(m.nombre, ' ', m.apellido) AS medico_nombre
    FROM evoluciones e
    LEFT JOIN tipos_evolucion t ON e.tipo_evolucion = t.id_tipo
    LEFT JOIN medicos m ON e.id_med = m.id_med
    WHERE e.id_paciente = ?
    ORDER BY e.fecha_hora DESC
  `;

  try {
    const result = await retornarQuery(query, [id_paciente]);
    if (result.error) throw new Error(result.error);

    return res.json({ success: true, datos: result });
  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/evoluciones/:id_evolucion', authenticateToken, async (req, res) => {
  const { id_evolucion } = req.params;

  if (!id_evolucion || isNaN(id_evolucion)) {
    return res.status(400).json({ success: false, error: 'id_evolucion inválido' });
  }

  const query = `
    SELECT 
      e.*,
      t.nombre AS tipo_evolucion_nombre,
      CONCAT(m.nombre, ' ', m.apellido) AS medico_nombre,
      d.presion_arterial,
      d.frec_cardiaca,
      d.frec_respiratoria,
      d.temperatura,
      d.sat_oxigeno,
      d.peso,
      d.talla,
      d.fecha_hora AS fecha_signos
    FROM evoluciones e
    LEFT JOIN tipos_evolucion t ON e.tipo_evolucion = t.id_tipo
    LEFT JOIN medicos m ON e.id_med = m.id_med
    LEFT JOIN datos_enfermeria d ON e.id_dato_enfermeria = d.id_datos_enfermeria
    WHERE e.id_evolucion = ?
  `;

  try {
    const result = await retornarQuery(query, [id_evolucion]);
    if (result.error) throw new Error(result.error);
    if (result.length === 0) {
      return res.status(404).json({ success: false, error: 'Evolución no encontrada' });
    }

    return res.json({ success: true, datos: result[0] });
  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/evoluciones/:id_evolucion', authenticateToken, async (req, res) => {
  const { id_evolucion } = req.params;
  const { signos_vitales, ...updateFields } = req.body;

  if (!id_evolucion || isNaN(id_evolucion)) {
    return res.status(400).json({ success: false, error: 'id_evolucion inválido' });
  }

  // 1. Verificar que la evolución existe y no está firmada
  const checkQuery = `SELECT firmada, id_paciente, id_cli, id_med FROM evoluciones WHERE id_evolucion = ?`;
  const checkResult = await retornarQuery(checkQuery, [id_evolucion]);
  if (checkResult.length === 0) {
    return res.status(404).json({ success: false, error: 'Evolución no encontrada' });
  }
  if (checkResult[0].firmada) {
    return res.status(400).json({ success: false, error: 'No se puede editar una evolución ya firmada' });
  }

  const { id_paciente, id_cli, id_med } = checkResult[0];
  let id_dato_enfermeria = null;

  try {
    // 2. Si hay nuevos signos_vitales, crear nuevo registro (reemplazar enlace)
    if (signos_vitales && Object.keys(signos_vitales).length > 0) {
      const {
        presion_arterial,
        frec_cardiaca,
        frec_respiratoria,
        temperatura,
        sat_oxigeno
      } = signos_vitales;

      const queryEnf = `
        INSERT INTO datos_enfermeria (
          id_paciente, id_cli, id_usuario_registrador, rol_registrador,
          presion_arterial, frec_cardiaca, frec_respiratoria, temperatura, sat_oxigeno,
          fecha_hora
        ) VALUES (?, ?, ?, 'medico', ?, ?, ?, ?, ?, NOW())
      `;
      const paramsEnf = [
        id_paciente, id_cli, id_med,
        presion_arterial || null,
        frec_cardiaca ? parseInt(frec_cardiaca, 10) : null,
        frec_respiratoria ? parseInt(frec_respiratoria, 10) : null,
        temperatura ? parseFloat(temperatura) : null,
        sat_oxigeno ? parseInt(sat_oxigeno, 10) : null
      ];

      const resultEnf = await retornarQuery(queryEnf, paramsEnf);
      id_dato_enfermeria = resultEnf.insertId;
    }

    // 3. Campos permitidos para actualizar
    const allowed = [
      'id_consulta', 'tipo_evolucion', 'motivo', 'estado_paciente',
      'hallazgos', 'resultados_estudios', 'plan', 'notas_adicionales'
    ];

    // Validar estado_paciente si viene
    if (updateFields.estado_paciente) {
      const estadosValidos = ['estable', 'mejoria', 'estacionario', 'empeoramiento', 'critico'];
      if (!estadosValidos.includes(updateFields.estado_paciente)) {
        return res.status(400).json({ success: false, error: 'estado_paciente no válido' });
      }
    }

    const whereConditions = { id_evolucion: parseInt(id_evolucion, 10) };
    let updateQueryObj = buildUpdateQuery('evoluciones', allowed, updateFields, whereConditions);

    if (id_dato_enfermeria !== null) {
      // Si creamos nuevo dato de enfermería, forzamos su inclusión
      if (!updateQueryObj) {
        updateQueryObj = {
          query: `UPDATE evoluciones SET id_dato_enfermeria = ? WHERE id_evolucion = ?`,
          values: [id_dato_enfermeria, id_evolucion]
        };
      } else {
        // Añadir id_dato_enfermeria al query existente
        const idx = updateQueryObj.query.lastIndexOf('WHERE');
        updateQueryObj.query = updateQueryObj.query.slice(0, idx) + ', id_dato_enfermeria = ? ' + updateQueryObj.query.slice(idx);
        updateQueryObj.values.splice(-1, 0, id_dato_enfermeria);
      }
    }

    if (!updateQueryObj) {
      return res.json({ success: false, error: 'No hay campos para actualizar' });
    }

    const result = await retornarQuery(updateQueryObj.query, updateQueryObj.values);
    return res.json({ success: true, datos: result });

  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/evoluciones/:id_evolucion/firmar', authenticateToken, async (req, res) => {
  const { id_evolucion } = req.params;

  // Validar que el ID sea numérico
  if (!id_evolucion || isNaN(id_evolucion)) {
    return res.status(400).json({ success: false, error: 'id_evolucion inválido' });
  }

  // Suponemos que authenticateToken inyecta req.user con el id del usuario autenticado
  const id_usuario_firma = req.id_usuario; // Ajusta según cómo guardes el ID en el token
  if (!id_usuario_firma) {
    return res.status(401).json({ success: false, error: 'Usuario no autenticado o sin ID' });
  }

  try {
    // 1. Verificar estado actual de la evolución
    const checkQuery = `
      SELECT 
        firmada, 
        id_med 
      FROM evoluciones 
      WHERE id_evolucion = ?
    `;
    const checkResult = await retornarQuery(checkQuery, [id_evolucion]);

    if (checkResult.length === 0) {
      return res.status(404).json({ success: false, error: 'Evolución no encontrada' });
    }

    const evol = checkResult[0];
    if (evol.firmada) {
      return res.status(400).json({ success: false, error: 'La evolución ya está firmada' });
    }


    // solo el médico que la creó pueda firmar:
   
    if (evol.id_med !== id_usuario_firma) {
      return res.status(403).json({ success: false, error: 'Solo el médico asignado puede firmar esta evolución' });
    }
  
    // 2. Actualizar como firmada
    const updateQuery = `
      UPDATE evoluciones 
      SET 
        firmada = TRUE,
        fecha_firma = NOW(),
        id_usuario_firma = ?
      WHERE id_evolucion = ?
    `;

    const result = await retornarQuery(updateQuery, [id_usuario_firma, id_evolucion]);
    if (result.error) throw new Error('Error al firmar la evolución');

    return res.json({
      success: true,
      mensaje: 'Evolución firmada correctamente',
      datos: {
        id_evolucion: parseInt(id_evolucion, 10),
        fecha_firma: new Date().toISOString()
      }
    });

  } catch (error) {
    registrarErrorPeticion(req, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;