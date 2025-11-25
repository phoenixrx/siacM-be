// routes/presupuestos.js
const express = require('express');
const router = express.Router();
const { retornar_query, retornarQuery } = require('../auth');

// GET /api/reportes - Obtener todos los presupuestos
router.get('/control-financiero/calculo-honorarios', async (req, res) => {
    const {id_cli, fechaInicio, fechaFin} = req.query;
    try {
        const query = `SELECT 
    ad.id_medico,
    CONCAT(m.nombre, ' ', m.apellido) AS name,
    e.id_gru_hon,
    ad.status_honorarios,
    geh.descripcion,
    YEAR(a.fecha_admision) AS anio,
    WEEK(a.fecha_admision, 1) AS semana,
    CONCAT('Semana ', WEEK(a.fecha_admision, 1), ' - ', YEAR(a.fecha_admision)) AS semana_descripcion,
    MIN(a.fecha_admision) AS fecha_inicio_semana,
    MAX(a.fecha_admision) AS fecha_fin_semana,
    SUM(ad.cantidad * ad.precio) AS total_generado_local,
    SUM(ad.cantidad * ad.precio_usd) AS total_generado_usd,
    SUM(
        CASE 
            WHEN COALESCE(geh.monto_fijo, 0) > 0 AND COALESCE(geh.id_moneda, 0) = 1 
                THEN COALESCE(geh.monto_fijo, 0) * COALESCE(ad.cantidad, 0)
            WHEN COALESCE(geh.monto_fijo, 0) > 0 AND COALESCE(geh.id_moneda, 0) = 2 
                THEN (COALESCE(geh.monto_fijo, 0) / NULLIF(COALESCE(a.tasa, 1), 0)) * COALESCE(ad.cantidad, 0)
            ELSE 
                (COALESCE(ad.cantidad, 0) * COALESCE(ad.precio_usd, 0)) * COALESCE(geh.porcentaje_med, 0)
        END
    ) AS honorarios_calculados,
    SUM(
        CASE 
            WHEN COALESCE(geh.monto_fijo, 0) > 0 AND COALESCE(geh.id_moneda, 0) = 2 
                THEN COALESCE(geh.monto_fijo, 0) * COALESCE(ad.cantidad, 0)
            WHEN COALESCE(geh.monto_fijo, 0) > 0 AND COALESCE(geh.id_moneda, 0) = 1 
                THEN (COALESCE(geh.monto_fijo, 0) * COALESCE(a.tasa, 1)) * COALESCE(ad.cantidad, 0)
            ELSE 
                (COALESCE(ad.cantidad, 0) * COALESCE(ad.precio, 0)) * COALESCE(geh.porcentaje_med, 0)
        END
    ) AS honorarios_calculados_bs,
    COUNT(*) AS total_registros    
FROM admisiones_det ad
INNER JOIN admisiones a ON ad.id_admision = a.id_admision
INNER JOIN estudios e ON ad.id_estudio = e.id_estudio
INNER JOIN grupo_estudio_honorarios geh ON e.id_gru_hon = geh.id_grupo_estudio
INNER JOIN medicos m ON ad.id_medico = m.id_medico
WHERE ad.activo = 1 
    AND a.activo = 1
    
    and a.id_cli=?         
    AND a.motivo_cierre IS NOT NULL 
    AND a.motivo_cierre != ''
        and a.fecha_admision BETWEEN ? AND CONCAT(?, ' 23:59:59')  
GROUP BY 
    ad.id_medico, 
    
    e.id_gru_hon, 
    ad.status_honorarios,
    YEAR(a.fecha_admision),
    WEEK(a.fecha_admision, 1)
ORDER BY 
    anio DESC, 
    semana DESC, 
    ad.id_medico, 
    e.id_gru_hon;`
    const reporteHonorarios = await retornar_query(query,[id_cli, fechaInicio, fechaFin]);
        
        if (!Array.isArray(reporteHonorarios)) {                         
            return res.json({
                success: false,
                error: 'Error interno al procesar el reporte nivel hon.'
            });
        }

        let query_acumulado = `SELECT 
    e.id_gru_hon,
    geh.descripcion,
    ad.status_honorarios,
    YEAR(STR_TO_DATE(?, '%Y-%m-%d')) AS anio_analizado,
    MONTH(STR_TO_DATE(?, '%Y-%m-%d')) AS mes_analizado,
    CONCAT(
        MONTHNAME(STR_TO_DATE(?, '%Y-%m-%d')), 
        ' ', 
        YEAR(STR_TO_DATE(?, '%Y-%m-%d'))
    ) AS periodo_descripcion,
    SUM(CASE WHEN YEAR(a.fecha_admision) = YEAR(STR_TO_DATE(?, '%Y-%m-%d')) 
             THEN ad.cantidad * ad.precio_usd ELSE 0 END) AS total_anual_usd,
    SUM(CASE WHEN YEAR(a.fecha_admision) = YEAR(STR_TO_DATE(?, '%Y-%m-%d')) 
             THEN ad.cantidad * ad.precio ELSE 0 END) AS total_anual_bs,
    SUM(CASE WHEN YEAR(a.fecha_admision) = YEAR(STR_TO_DATE(?, '%Y-%m-%d')) THEN
        CASE 
            WHEN COALESCE(geh.monto_fijo, 0) > 0 AND COALESCE(geh.id_moneda, 0) = 1 
                THEN COALESCE(geh.monto_fijo, 0) * COALESCE(ad.cantidad, 0)
            WHEN COALESCE(geh.monto_fijo, 0) > 0 AND COALESCE(geh.id_moneda, 0) = 2 
                THEN (COALESCE(geh.monto_fijo, 0) / NULLIF(COALESCE(a.tasa, 1), 0)) * COALESCE(ad.cantidad, 0)
            ELSE 
                (COALESCE(ad.cantidad, 0) * COALESCE(ad.precio_usd, 0)) * COALESCE(geh.porcentaje_med, 0)
        END
    ELSE 0 END) AS honorarios_anuales,
    SUM(CASE WHEN YEAR(a.fecha_admision) = YEAR(STR_TO_DATE(?, '%Y-%m-%d')) THEN
        CASE 
            WHEN COALESCE(geh.monto_fijo, 0) > 0 AND COALESCE(geh.id_moneda, 0) = 2 
                THEN COALESCE(geh.monto_fijo, 0) * COALESCE(ad.cantidad, 0)
            WHEN COALESCE(geh.monto_fijo, 0) > 0 AND COALESCE(geh.id_moneda, 0) = 1 
                THEN (COALESCE(geh.monto_fijo, 0) * COALESCE(a.tasa, 1)) * COALESCE(ad.cantidad, 0)
            ELSE 
                (COALESCE(ad.cantidad, 0) * COALESCE(ad.precio, 0)) * COALESCE(geh.porcentaje_med, 0)
        END
    ELSE 0 END) AS honorarios_anuales_bs,    
    SUM(CASE WHEN YEAR(a.fecha_admision) = YEAR(STR_TO_DATE(?, '%Y-%m-%d')) 
             AND MONTH(a.fecha_admision) = MONTH(STR_TO_DATE(?, '%Y-%m-%d'))
             THEN ad.cantidad * ad.precio_usd ELSE 0 END) AS total_mes_usd,
    SUM(CASE WHEN YEAR(a.fecha_admision) = YEAR(STR_TO_DATE(?, '%Y-%m-%d')) 
             AND MONTH(a.fecha_admision) = MONTH(STR_TO_DATE(?, '%Y-%m-%d'))
             THEN ad.cantidad * ad.precio ELSE 0 END) AS total_mes_bs,
    SUM(CASE WHEN YEAR(a.fecha_admision) = YEAR(STR_TO_DATE(?, '%Y-%m-%d')) 
             AND MONTH(a.fecha_admision) = MONTH(STR_TO_DATE(?, '%Y-%m-%d')) THEN
        CASE 
            WHEN COALESCE(geh.monto_fijo, 0) > 0 AND COALESCE(geh.id_moneda, 0) = 1 
                THEN COALESCE(geh.monto_fijo, 0) * COALESCE(ad.cantidad, 0)
            WHEN COALESCE(geh.monto_fijo, 0) > 0 AND COALESCE(geh.id_moneda, 0) = 2 
                THEN (COALESCE(geh.monto_fijo, 0) / NULLIF(COALESCE(a.tasa, 1), 0)) * COALESCE(ad.cantidad, 0)
            ELSE 
                (COALESCE(ad.cantidad, 0) * COALESCE(ad.precio_usd, 0)) * COALESCE(geh.porcentaje_med, 0)
        END
    ELSE 0 END) AS honorarios_mes, 
    SUM(CASE WHEN YEAR(a.fecha_admision) = YEAR(STR_TO_DATE(?, '%Y-%m-%d')) 
             AND MONTH(a.fecha_admision) = MONTH(STR_TO_DATE(?, '%Y-%m-%d')) THEN
        CASE 
             WHEN COALESCE(geh.monto_fijo, 0) > 0 AND COALESCE(geh.id_moneda, 0) = 2 
                THEN COALESCE(geh.monto_fijo, 0) * COALESCE(ad.cantidad, 0)
            WHEN COALESCE(geh.monto_fijo, 0) > 0 AND COALESCE(geh.id_moneda, 0) = 1 
                THEN (COALESCE(geh.monto_fijo, 0) * COALESCE(a.tasa, 1)) * COALESCE(ad.cantidad, 0)
            ELSE 
                (COALESCE(ad.cantidad, 0) * COALESCE(ad.precio, 0)) * COALESCE(geh.porcentaje_med, 0)
        END
    ELSE 0 END) AS honorarios_mes_bs,    
    COUNT(*) AS total_registros    
FROM admisiones_det ad
INNER JOIN admisiones a ON ad.id_admision = a.id_admision
INNER JOIN estudios e ON ad.id_estudio = e.id_estudio
INNER JOIN grupo_estudio_honorarios geh ON e.id_gru_hon = geh.id_grupo_estudio
WHERE ad.activo = 1 
    AND a.activo = 1
    AND ad.activo = 1
    AND a.id_cli = ?         
    AND a.fecha_admision BETWEEN 
        CONCAT(YEAR(STR_TO_DATE(?, '%Y-%m-%d')), '-01-01') 
        AND CONCAT(?, ' 23:59:59')
        AND a.motivo_cierre IS NOT NULL 
        AND a.motivo_cierre != ''
GROUP BY 
    e.id_gru_hon, 
    geh.descripcion,
    ad.status_honorarios,
    anio_analizado,
    mes_analizado,
    periodo_descripcion
ORDER BY 
    e.id_gru_hon, 
    ad.status_honorarios;`

    const reporteHonorariosAcumulado = await retornar_query(query_acumulado, [
    fechaFin, // 1. anio_analizado
    fechaFin, // 2. mes_analizado
    fechaFin, // 3. periodo_descripcion (MONTHNAME)
    fechaFin, // 4. periodo_descripcion (YEAR)
    fechaFin, // 5. total_anual_usd / total_anual_bs / etc.
    fechaFin, // 6. total_anual_bs
    fechaFin, // 7. honorarios_anuales
    fechaFin, // 8. honorarios_anuales_bs
    fechaFin, // 9. total_mes_usd (año)
    fechaFin, // 10. total_mes_usd (mes)
    fechaFin, // 11. total_mes_bs (año)
    fechaFin, // 12. total_mes_bs (mes)
    fechaFin, // 13. honorarios_mes (año)
    fechaFin, // 14. honorarios_mes (mes)
    fechaFin, // 15. honorarios_mes_bs (año)
    fechaFin, // 16. honorarios_mes_bs (mes)
    id_cli,   // 17. a.id_cli
    fechaFin, // 18. a.fecha_admision >= ...
    fechaFin  // 19. a.fecha_admision <= ...
]);

        return res.json({
            success: true,
            data: reporteHonorarios,
            dataAcumulada: reporteHonorariosAcumulado,
            query_acumulado
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(400).json({
            success: false,
            error: 'Error al procesar el reporte nivel h',
            details: error.message
        });
    }
});

router.get('/control-financiero/calculo-gastos', async (req, res) => {
    const {id_cli, fechaInicio, fechaFin} = req.query;
    try {
        const query = `SELECT 
            cg.id AS categoria_id,
            cg.nombre AS categoria_nombre,
            cg.color_hex,
            g.estado,
            YEAR(g.fecha_gasto) AS anio,
            WEEK(g.fecha_gasto, 1) AS semana,
            CONCAT('Semana ', WEEK(g.fecha_gasto, 1), ' - ', YEAR(g.fecha_gasto)) AS semana_descripcion,
            MIN(g.fecha_gasto) AS fecha_inicio_semana,
            MAX(g.fecha_gasto) AS fecha_fin_semana,
            SUM(g.monto) AS total_usd,
            SUM(g.monto_bs) AS total_bs,
            COUNT(*) AS total_gastos
        FROM gastos g
        INNER JOIN categorias_gastos cg ON g.categoria_id = cg.id
        WHERE g.id_cli = ?
            AND cg.activo = 1
        and g.fecha_gasto BETWEEN ? AND CONCAT(?, ' 23:59:59')  
        GROUP BY 
            cg.id,
            cg.nombre,
            cg.color_hex,
            g.estado,
            YEAR(g.fecha_gasto),
            WEEK(g.fecha_gasto, 1)
        ORDER BY 
            anio DESC,
            semana DESC,
            cg.nombre,
            g.estado;`
        const reporteGastos = await retornar_query(query,[id_cli, fechaInicio, fechaFin]);


        if (!Array.isArray(reporteGastos)) {                         
            return res.json({
                success: false,
                error: 'Error interno al procesar el reporte nivel hon.'
            });
        }
    const query_acumulado = `SELECT 
            YEAR(g.fecha_gasto) AS anio,
            MONTH(g.fecha_gasto) AS mes,
            CONCAT(MONTHNAME(g.fecha_gasto), ' ', YEAR(g.fecha_gasto)) AS periodo_descripcion,
            g.estado,
            SUM(g.monto) AS total_usd,
            SUM(g.monto_bs) AS total_bs,
            SUM(g.moneda) AS cantidad_usd,
            SUM(g.moneda) AS cantidad_bs,
            COUNT(*) AS total_gastos,
            MIN(g.fecha_gasto) AS primera_fecha,
            MAX(g.fecha_gasto) AS ultima_fecha    
        FROM gastos g
        WHERE g.id_cli = ?
            AND g.fecha_gasto BETWEEN ? AND CONCAT(?, ' 23:59:59')
        GROUP BY 
            YEAR(g.fecha_gasto),
            MONTH(g.fecha_gasto),
            g.estado
        ORDER BY 
            anio DESC,
            mes DESC,
            g.estado;`
        const anioActual = new Date(fechaFin).getFullYear();
        const anioAnterior = anioActual - 1;

        let anterior = `${anioAnterior}-12-01`;
        let finAnioActual = `${anioActual}-12-31`;       
        
        const reporteGastosAcumulado = await retornar_query(query_acumulado,[id_cli, anterior, finAnioActual]);

        return res.json({
            success: true,
            data: reporteGastos,
            dataAcumulada:reporteGastosAcumulado
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(400).json({
            success: false,
            error: 'Error al procesar el reporte nivel h',
            details: error.message
        });
    }
});

router.get('/control-financiero/gastos-ingresos', async (req, res) => {
    const {id_cli, fechaFin} = req.query;

        const anioActual = new Date(fechaFin).getFullYear();
        const mesActual = new Date(fechaFin).getMonth() + 1;      

        let fechaInicioAnio = `${anioActual}-01-01`;
             

    try {
        const queryGastos = `SELECT 
                    YEAR(fecha_gasto) as año,
                    MONTH(fecha_gasto) as mes,
                    moneda,
                    estado,
                    SUM(monto) as total_monto,
                    SUM(monto_bs) as total_monto_bs,
                    COUNT(*) as cantidad_gastos
                FROM gastos
                WHERE id_cli = ?
                    AND fecha_gasto BETWEEN ? AND CONCAT(?, ' 23:59:59')  
                GROUP BY 
                    YEAR(fecha_gasto),
                    MONTH(fecha_gasto),
                    moneda,
                    estado
                ORDER BY 
                    año DESC,
                    mes DESC,
                    moneda,
                    estado;`
        
        const reporteGastos = await retornar_query(queryGastos,[id_cli, fechaInicioAnio, fechaFin]);
        
        const queryIngresos = ` 
                        SELECT 
                            YEAR(a.fecha_admision) as año,
                            MONTH(a.fecha_admision) as mes,
                            SUM(ad.cantidad * ad.precio) as total_precio,
                            SUM(ad.cantidad * ad.precio_usd) as total_precio_usd,
                            COUNT(DISTINCT a.id_admision) as cantidad_admisiones,
                            COUNT(ad.id_admidet) as cantidad_detalles
                        FROM admisiones a
                        INNER JOIN admisiones_det ad ON a.id_admision = ad.id_admision
                        WHERE a.id_cli = ?
                            AND a.motivo_cierre IS NOT NULL 
                            AND a.motivo_cierre != ''
                            AND a.activo = 1
                            AND ad.activo = 1
                            AND a.fecha_admision BETWEEN ? AND CONCAT(?, ' 23:59:59')                          
                        GROUP BY 
                            YEAR(a.fecha_admision),
                            MONTH(a.fecha_admision)
                        ORDER BY 
                            año DESC,
                            mes DESC;`;

        const reporteIngresos = await retornar_query(queryIngresos,[id_cli, fechaInicioAnio, fechaFin]);

        return res.json({
            success: true,
            dataGastos: reporteGastos,
            dataIngresos:reporteIngresos
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(400).json({
            success: false,
            error: 'Error al procesar el reporte nivel gi',
            details: error.message
        });
    }
});

//cuadre caja
router.get('/cuadre-caja', async (req, res) => {
    const {id_cli, fecha1, fecha2, id_usuario, soloContado=false, soloFactura=false, activo=false, caja, cajaPrincipal=false} = req.query;

    try {
        let usuariosCaja = [];        
        let usuariosString = id_usuario;
        if(!id_usuario){usuariosString=''}
        let cajasQuery =''
        
        if(caja){
            cajasQuery=`
                SELECT 
                    cu.id_usuario 
                FROM caja_usuarios cu
                WHERE cu.id_caja=?`;
            usuariosCaja = await retornarQuery(cajasQuery, [caja]);

            if(cajaPrincipal){
                cajasQuery=`
                    SELECT id_usuario 
                    FROM perfil_usuario_basico
                    WHERE id_usuario_empresa=? 
                    AND id_usuario NOT IN (
                        SELECT 
                            cu.id_usuario 
                        FROM caja_usuarios cu
                        INNER JOIN cajas c ON c.id=cu.id_caja 
                        WHERE c.id_cli=?
                        )`;
                usuariosCaja = await retornarQuery(cajasQuery, [id_cli, id_cli]);
            }   
            
            if (!usuariosCaja || !Array.isArray(usuariosCaja.data)) {
                return;
            }

                // Mapeamos los id_usuario y los unimos con comas
                usuariosString = usuariosCaja.data.map(item => item.id_usuario).join(',');
        }
        

        let query = `
            SELECT 
                cp.id_externa,
                cp.tipo,
                cp.id_forma_pago,
                cp.id_moneda,
                cp.nota,
                cp.fecha_creacion,
                cp.activo,
                cp.id_usuario,
                cp.base_igtf,
                cp.id_usuario_elimina,
                CASE WHEN cp.id_moneda=1 THEN cp.monto 
                    WHEN cp.id_moneda=2  THEN cp.monto/a.tasa 
                ELSE 0  -- Valor por defecto
                END AS monto_usd,
                CASE WHEN cp.id_moneda=1 THEN cp.monto*a.tasa 
                    WHEN cp.id_moneda=2  THEN cp.monto 
                ELSE 0  -- Valor por defecto
                END     AS monto_bs,
                m.descripcion AS moneda,
                fp.id_forma_pago,
                fp.descripcion AS forma_pago,
                fp.credito,
                a.id_admision,
                a.tasa,
                a.activo AS activo_admin,
                a.fecha_admision AS fecha_admi,
                a.factura,
                a.consec_recibo as recibo,
                a.id_admision,
                CONCAT(p.nombres, ' ',p.apellidos) as paciente,
                CONCAT(p.tipo_cedula, '-', p.cedula) as cedula,
                u.usuario
            FROM 
                control_pagos cp
                INNER JOIN monedas m ON m.id_moneda = cp.id_moneda
                INNER JOIN formas_pago fp ON fp.id_forma_pago = cp.id_forma_pago
                INNER JOIN admisiones a ON a.id_admision = cp.id_externa
                INNER JOIN pacientes p ON a.id_paciente = p.id_paciente
                INNER JOIN usuarios u ON u.id = cp.id_usuario                
            WHERE 
                cp.id_cli = ?
                AND cp.fecha_creacion BETWEEN ? AND ?`;

        const params = [id_cli, fecha1, `${fecha2} 23:59:59`];

        if (soloContado === true) {
            query += ' AND fp.credito = 0';            
        }

        if (soloFactura === true) {
            query += " AND a.factura IS NOT NULL and a.factura != '' "; 
        }

        if(activo===true){
           query += " AND cp.activo = 1" 
        }

        if (id_usuario) {
            query += ` AND cp.id_usuario IN (?)`;
            params.push(usuariosString);            
        }else{
            if (usuariosString!=''){
                query += ` AND cp.id_usuario IN (${usuariosString})`;
            }
        }

        query += ' ORDER BY cp.fecha_creacion';
        
        const detalleReporte = await retornarQuery(query, params);
        const cantidad = Array.isArray(detalleReporte?.data) ? detalleReporte.data.length : 0;
       
        return res.json({
            success: true,
            Detalles: detalleReporte,
            Cantidad: cantidad,
            usuariosCaja: usuariosString   
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(400).json({
            success: false,
            error: 'Error al procesar el reporte nivel gi',
            details: error.message,
        });
    }
});


router.get('/pacientes_localidades', async (req, res)=>{
const {id_cli, desde, hasta, estado} = req.query
  
  if (!id_cli ){
    return res.json({error: "Faltan datos"})
  }
    
  let filtro_estado = '';
  if (estado!='pais'){
    filtro_estado='a.id_estado='+estado+' AND';
  } 
  let query = `
  SELECT a.id_admision,
        CONCAT(p.nombres, ' ',p.apellidos) as paciente,        
        p.fecha_nacimiento,
        CONCAT(p.tipo_cedula, '-', p.cedula) as cedula,
        a.id_estado,
        e.estado,
        a.id_municipio, 
        m.municipio,
        a.id_parroquia,
        prr.parroquia,
        a.id_zona,
        z.zona,
        a.fecha_admision 
      FROM 
        admisiones a
      INNER JOIN  
        estados e ON e.id_estado = a.id_estado
      INNER JOIN
        pacientes p ON p.id_paciente =a.id_paciente
      INNER JOIN
        municipios m ON m.id_municipio = a.id_municipio
      INNER JOIN 
        parroquias prr ON prr.id_parroquia = a.id_parroquia
      LEFT OUTER JOIN 
        zonas z ON z.id_zona = a.id_zona
      WHERE
        a.id_cli =? AND
        a.activo =1 AND
        ${filtro_estado}
        a.fecha_admision BETWEEN ? AND CONCAT(?, ' 23:59:59') 
      ORDER BY a.fecha_admision DESC 
                  `  
  try {
    
    const admisiones = await retornar_query(query, [id_cli,desde,hasta]);
    if(admisiones.error){
     
      return res.json({
        success: false,
        error: "No existen especialistas del area"
      }); 
    }
      return res.json({
        success: true,
        result: admisiones,               
      });      
      
    } catch {
      return res.json({
        success: false,
        error: error,        
      });
    }
} ) 

router.get('/stat-admisiones', async (req, res)=>{
const {id_cli, desde, hasta, modo, usuario} = req.query
  
    if (!id_cli ){
        return res.json({error: "Faltan datos"})
    }
    let query_filtro ='';
    if(usuario){
        if(isNaN(usuario)){
            return res.json({error: "Faltan datos"})
        }
        
        if(Number(usuario)!=0){
            query_filtro = ` AND ad.id_usuario = ${usuario} `
        }
    }
    

    let queryModo =' INNER JOIN tipo_estudio eg ON eg.id_tipo_estudio = e.id_tipo_estudio '

    if(modo=='grupo'){
        queryModo = ' INNER JOIN grupo_estudio eg ON eg.id_grupo_estudio = e.id_grupo_estudio '
    }
    
  let query = `
  SELECT COUNT(ad.id_admision) as total,
    SUM(ad.cantidad * ad.precio) as total_bs,
    SUM(ad.cantidad * ad.precio_usd) as total_us,
    eg.descripcion as nombre_grupo
  FROM admisiones_det ad
  INNER JOIN admisiones a ON a.id_admision = ad.id_admision
  INNER JOIN estudios e ON e.id_estudio = ad.id_estudio
  ${queryModo}  
  WHERE a.id_cli = ? AND
    a.activo = 1 AND 
    ad.activo = 1 AND
    a.fecha_admision BETWEEN ? AND CONCAT(?, ' 23:59:59')
    ${query_filtro}
  GROUP BY eg.descripcion
  ORDER BY eg.descripcion ASC;
    `;  
    query_filtro ='';
        if(usuario){
            if(Number(usuario)!=0){
                query_filtro = ` AND (a.id_usuario = ${usuario} OR a.id_usuario_cierre = ${usuario})  `
            }
        }
        
    let query_admisionesAbiertas = `
        SELECT 
            COUNT(a.id_status_cierre) as total,
            a.id_status_cierre,
            a.tipo_consulta,
            u.usuario as usuario_abre,
            uc.usuario as usuario_cierre            
        FROM admisiones a
        INNER JOIN usuarios u ON u.id = a.id_usuario
        LEFT JOIN usuarios uc ON uc.id = a.id_usuario_cierre
        WHERE a.id_cli = ? AND
            a.activo = 1 AND 
            a.fecha_admision BETWEEN ? AND CONCAT(?, ' 23:59:59') 
            ${query_filtro}
        GROUP BY a.tipo_consulta, 
            a.id_status_cierre, 
            u.usuario,
            uc.usuario    
        ORDER BY a.tipo_consulta ASC;`;
  try {
    
    const admisiones = await retornarQuery(query, [id_cli,desde,hasta]);
    const admisionesAbiertasUsuario = await retornarQuery(query_admisionesAbiertas, [id_cli,desde,hasta]);
    if(admisiones.error){     
      return res.json({
        success: false,
        error: admisiones.error
      }); 
    }
    if(admisionesAbiertasUsuario.error){     
      return res.json({
        success: false,
        error: admisionesAbiertasUsuario.error
      }); 
    }
      return res.json({
        success: true,
        result: admisiones,     
        resultAbiertas: admisionesAbiertasUsuario  
      });      
      
    } catch {
      return res.json({
        success: false,
        error: error,        
      });
    }
} ) 


router.get('/comisiones_referido', async (req, res)=>{
  const {id_cli, estudiosEx, fechaInicial, fechaFinal, id_canal_atraccion} = req.query
 
  if (!id_cli || !estudiosEx || !fechaInicial || !fechaFinal){
    return res.json({error: "Faltan datos"})
  }

  let estudiosExcluidos = `AND ad.id_estudio NOT IN (${estudiosEx})`;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaInicial)) {
    return res.status(400).json({ error: 'El formato de la fecha debe ser YYYY-MM-DD.' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaFinal)) {  
    return res.status(400).json({ error: 'El formato de la fecha debe ser YYYY-MM-DD.' });
  }

  let vendedores = "";
  
  if(id_canal_atraccion!=''){
    vendedores = `AND a.id_canal_atraccion = ${id_canal_atraccion}`;
  }

  //3588,3584,3583
  
  let query = `SELECT 
    a.id_admision,
    ca.descripcion as captadora,
    ad.precio*ad.cantidad as monto,
    ad.precio_usd*ad.cantidad as monto_usd,
    ca.comision,
    ((ad.precio*ad.cantidad) * ca.comision) as comision_bs,
    ((ad.precio_usd*ad.cantidad) * ca.comision) as comision_us,
    CONCAT(p.tipo_cedula, ' ', p.cedula) as cedula,
    CONCAT(p.nombres, ' ', p.apellidos) AS paciente,
    e.descripcion,
    a.fecha_admision,
    CONCAT(m.nombre, ' ', m.apellido) AS medico
FROM 
    admisiones a
INNER JOIN 
    canales_atraccion ca ON ca.id_canal_atraccion = a.id_canal_atraccion
INNER JOIN 
    admisiones_det ad ON ad.id_admision = a.id_admision
INNER JOIN 
    medicos m ON m.id_medico = ad.id_medico
INNER JOIN 
    estudios e ON e.id_estudio = ad.id_estudio
INNER JOIN 
    pacientes p ON p.id_paciente = a.id_paciente
WHERE 
    a.id_canal_atraccion > 0 
    AND a.fecha_admision BETWEEN ? AND CONCAT(?, ' 23:59:59')
    AND a.id_cli = ?
    AND a.activo=1
    AND ad.activo=1
    AND a.id_status_cierre > 1
    ${estudiosExcluidos}
    ${vendedores};`;

try {

  let listado_comisiones = await retornar_query(query, [fechaInicial,fechaFinal,id_cli])

  return res.json({
    success: true,
    data: listado_comisiones
  })
  
} catch (error) {
registrarErrorPeticion(req, error)
  return res.json({
    success: false,
    error: error})
}
})

router.post('/comisiones_referido-estudios', async (req, res)=>{
  const {id_estudio} = req.body
 
  if (!id_estudio || isNaN(id_estudio) ){
    return res.json({error: "Faltan datos"})
  }
  
  let query = `INSERT INTO
    reporte_comisiones_excluidas
      (id_estudio) 
    VALUES (?);`;

  try {

    let insertar_estudio = await retornar_query(query, [id_estudio])

    return res.json({
      success: true,
      data: insertar_estudio
    })
    
  } catch (error) {
registrarErrorPeticion(req, error)
    return res.json({
      success: false,
      error: error})
  }
})

router.get('/comisiones_referido-estudios', async (req, res)=>{
  const {id_cli} = req.query
 
  if (!id_cli || isNaN(id_cli) ){
    return res.json({error: "Faltan datos"})
  }
  
  let query = `SELECT 
    e.id_estudio,
    e.descripcion,
    e.insumo,
    ex.id
FROM
    estudios e
INNER JOIN
    reporte_comisiones_excluidas ex ON ex.id_estudio = e.id_estudio
WHERE
    e.id_cli = ?;`;

  try {

    let estudios_excluidos = await retornar_query(query, [id_cli])

    return res.json({
      success: true,
      data: estudios_excluidos
    })
    
  } catch (error) {
    registrarErrorPeticion(req, error)
    return res.json({
      success: false,
      error: error})
  }
})

router.delete('/comisiones_referido-estudios', async (req, res)=>{
  const {id} = req.query
 
  if (!id || isNaN(id) ){
    return res.json({error: "Faltan datos"})
  }
  
  let query = `DELETE FROM
    reporte_comisiones_excluidas
WHERE
    id = ?;`;

  try {

    let estudios_excluidos = await retornar_query(query, [id])

    return res.json({
      success: true,
      data: estudios_excluidos
    })
    
  } catch (error) {
    registrarErrorPeticion(req, error)
    return res.json({
      success: false,
      error: error})
  }
})

router.get('/libro-ventas/:id_cli', async (req, res) => {
    const { id_cli } = req.params;
    const {fecha1, fecha2} = req.query;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha1)) {        
        return res.status(400).json({ error: 'El formato de la fecha inicial debe ser YYYY-MM-DD.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha2)) {  
        return res.status(400).json({ error: 'El formato de la fecha final debe ser YYYY-MM-DD.' });
    }

    const fechas = `'${fecha1}' AND CONCAT('${fecha2}', ' 23:59:59')`;

    try {
        let query = `
        SELECT 
            paciente,
            fecha,
            razon_social,
            rif,
            tipo,
            num_control,
            factura,
            nota_credito,
            factura_afectada,
            total_ventas,
            ventas_exentas,
            base_imponible_16,
            iva,
            base_igtf,
            igtf,
            ident,
            activo
        FROM (
            -- Facturas
            SELECT 
                paciente,
                fecha_emision AS fecha, 
                razon_social,
                rif,
                tipo, 
                num_control,
                factura,
                ' ' AS nota_credito,
                ' ' AS factura_afectada,
                total AS total_ventas,
                exento AS ventas_exentas,
                bi16 AS base_imponible_16,
                iva16 AS iva,
                base_igtf,
                igtf,
                CONCAT('FC', id_factura) AS ident,
                activo
            FROM facturas 
            WHERE 
                id_cli = ? AND
                fecha_emision BETWEEN ${fechas}

            UNION ALL

            -- Notas de Crédito (NDC) vinculadas a facturas
            SELECT 
                NULL AS paciente,
                nf.fecha_nota AS fecha, 
                f.razon_social,
                f.rif,
                nf.tipo, 
                nf.control AS num_control,
                nf.factura,
                nf.num_nota AS nota_credito,
                nf.factura AS factura_afectada,
                nf.total AS total_ventas,
                (f.exento) * (-1) AS ventas_exentas,
                (f.bi16) * (-1) AS base_imponible_16,
                (f.iva16) * (-1) AS iva,
                (f.base_igtf) * (-1) AS base_igtf, 
                (f.igtf) * (-1) AS igtf,
                CONCAT('NT', nf.id_nota) AS ident,
                '1' AS activo
            FROM facturas f
            INNER JOIN notas_factura nf ON nf.factura = f.factura
            WHERE 
                nf.id_cli = ? AND
                nf.tipo = 'NDC' AND
                nf.fecha_nota BETWEEN ${fechas}

            UNION ALL

            -- Notas de Débito (NDD) vinculadas a facturas
            SELECT 
                NULL AS paciente,
                nf.fecha_nota AS fecha, 
                f.razon_social,
                f.rif,
                nf.tipo, 
                nf.control AS num_control,
                nf.factura,
                nf.num_nota AS nota_credito,
                nf.factura AS factura_afectada,
                nf.total AS total_ventas,
                f.exento AS ventas_exentas,
                f.bi16 AS base_imponible_16,
                f.iva16 AS iva,
                f.base_igtf,
                f.igtf,
                CONCAT('NT', nf.id_nota) AS ident,
                '1' AS activo
            FROM facturas f
            INNER JOIN notas_factura nf ON nf.factura = f.factura
            WHERE 
                nf.id_cli = ? AND
                nf.tipo = 'NDD' AND
                nf.fecha_nota BETWEEN ${fechas}

            UNION ALL

            -- Notas de Débito (NDD) vinculadas directamente a pacientes
            SELECT 
                CONCAT(p.nombres, ' ', p.apellidos) AS paciente,
                nf.fecha_nota AS fecha, 
                CONCAT(p.nombres, ' ', p.apellidos) AS razon_social,
                CONCAT(p.tipo_cedula, '-', p.cedula) AS rif,
                nf.tipo, 
                nf.control AS num_control,
                nf.factura,
                nf.num_nota AS nota_credito,
                nf.factura AS factura_afectada,
                nf.total AS total_ventas,
                nf.total AS ventas_exentas,
                '0.00' AS base_imponible_16,
                '0.00' AS iva,
                '0.00' AS base_igtf,
                '0.00' AS igtf,
                CONCAT('NT', nf.id_nota) AS ident,
                '1' AS activo
            FROM pacientes p
            INNER JOIN notas_factura nf ON nf.id_paciente = p.id_paciente
            WHERE 
                nf.id_paciente > 0 AND
                nf.id_cli = ? AND
                nf.tipo = 'NDD' AND
                nf.fecha_nota BETWEEN ${fechas}

            UNION ALL

            -- Notas de Crédito (NDC) vinculadas directamente a pacientes
            SELECT 
                CONCAT(p.nombres, ' ', p.apellidos) AS paciente,
                nf.fecha_nota AS fecha, 
                CONCAT(p.nombres, ' ', p.apellidos) AS razon_social,
                CONCAT(p.tipo_cedula, '-', p.cedula) AS rif,
                nf.tipo, 
                nf.control AS num_control,
                nf.factura,
                nf.num_nota AS nota_credito,
                nf.factura AS factura_afectada,
                nf.total AS total_ventas,
                nf.total AS ventas_exentas,
                '0.00' AS base_imponible_16,
                '0.00' AS iva,
                '0.00' AS base_igtf,
                '0.00' AS igtf,
                CONCAT('NT', nf.id_nota) AS ident,
                '1' AS activo
            FROM pacientes p
            INNER JOIN notas_factura nf ON nf.id_paciente = p.id_paciente
            WHERE 
                nf.id_paciente > 0 AND
                nf.id_cli = ? AND
                nf.tipo = 'NDC' AND
                nf.fecha_nota BETWEEN ${fechas}
        ) AS libro_ventas
        ORDER BY 
            num_control DESC;
        `
        const libroVentas = await retornarQuery(query, [id_cli, id_cli, id_cli, id_cli,id_cli]);
        console.log(libroVentas)
        if (!Array.isArray(libroVentas.data)) {
            return res.json({                
                success: false,
                error: 'Error interno al procesar el libro de ventas.'
            });
        }
        if(libroVentas.data.length==0){
            return res.json({
                success: false,
                error: "No existen datos para mostrar",
                data: []
            });
        }
        return res.json({
            success: true,
            data: libroVentas.data
        });
        

    } catch (error) {
        registrarErrorPeticion(req, error);
        return res.json({        
                success: false,
                error: 'Error interno al procesar el libro de ventas.'
            });
    }
});


module.exports = router;