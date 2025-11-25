// routes/portal_medico.js
const express = require('express');
const router = express.Router();
const { retornar_query } = require('../auth');

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

module.exports = router;