const express = require('express');
const router = express.Router();
const { retornarQuery } = require('../auth');
const { authenticateToken, registrarErrorPeticion } = require('../middlewares/autenticarToken');
//  /api/inventarios

router.get('/reportes/movimiento-articulo', async (req, res) => {
    const {id_insumo, fecha1, fecha2} = req.query;

    if(!id_insumo || !fecha1 || !fecha2){
        return res.status(400).json({
            success: false,
            error: 'Faltan datos para procesar la solicitud'
        });
    }

    try {
        
        let query = `
           SELECT 
    CONCAT('Sem-', LPAD(semana, 2, '0'),'-', año) AS semana,    
    estudio,
    cantidad_semanal AS cantidad_total,
    @acumulado := IF(@estudio_actual = BINARY estudio, @acumulado + cantidad_semanal, cantidad_semanal) AS saldo_acumulado,
    @estudio_actual := BINARY estudio
FROM (
    SELECT 
        YEAR(am.fecha_creacion) AS año,
        WEEK(am.fecha_creacion, 1) AS semana,
        e.descripcion AS estudio,
        SUM(am.cantidad) AS cantidad_semanal
    FROM 
        almacen_movimientos am
        INNER JOIN estudios e ON am.id_insumo = e.id_estudio
    WHERE 
        am.id_insumo = ?
        AND am.fecha_creacion BETWEEN ? AND ?       
    GROUP BY 
        YEAR(am.fecha_creacion),
        WEEK(am.fecha_creacion, 1),
        e.descripcion
    ORDER BY 
        e.descripcion, YEAR(am.fecha_creacion), WEEK(am.fecha_creacion, 1)
) AS movimientos_semanales
CROSS JOIN (SELECT @acumulado := 0, @estudio_actual := '') vars
ORDER BY 
    estudio, año, semana;`;

        const params = [id_insumo, fecha1, `${fecha2} 23:59:59`];

        const detalleReporte = await retornarQuery(query, params);        
       
        return res.json({
            success: true,
            Detalles: detalleReporte
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(400).json({
            success: false,
            error: 'Error al procesar el reporte nivel gi',
            details: error.message,
        });
    }
});

router.post('/admisiones/reversar-venta/:id_admidet', authenticateToken, async (req, res) => {
    const { id_admidet } = req.params;

    let query_movimiento =
        `SELECT id_movimiento_almacen
        FORM almacen_movimientos
        WHERE id_admidet = ? AND cantidad<0`
    try {
        
    const id_movimiento_almacen = await retornarQuery(query_movimiento, [id_admidet]);       
    if(id_movimiento_almacen.data[0].length === 0){
        registrarErrorPeticion(req, "No se encontro el movimiento en el almacen");
        return res.status(400).json({
            success: false,
            error: 'Error al procesar el movimiento en el almacen',
            details: id_movimiento_almacen.data[0].message,
        })
    } 
    const id_movimiento = id_movimiento_almacen.data[0].id_movimiento_almacen;
    let query_anular_mov = 
        `INSERT INTO almacen_movimientos 
            (id_almacen, id_insumo, id_entrega, id_responsable, cantidad, descripcion, id_admidet)
        SELECT 
            id_almacen, id_insumo, id_entrega, id_responsable, cantidad*(-1), 'Reversa Venta', id_admidet
        FROM 
            almacen_movimientos
        WHERE
            id_movimiento_almacen=?`;
    const anular_mov = await retornarQuery(query_anular_mov, [id_movimiento]);  
        if(anular_mov.data[0].length === 0){
            registrarErrorPeticion(req, "No se pudo anular el movimiento en el almacen");
            return res.status(400).json({
                success: false,
                error: 'Error al procesar el movimiento en el almacen',
                details: anular_mov.data[0].message,
            })
        } 
    return res.json({
            success: true
        });
    } catch (error) { 
        registrarErrorPeticion(req, error);
        return res.status(400).json({
            success: false,
            error: 'Error al procesar la anulacion',
            details: error.message,
        });
    }
})

router.get("/insumos-almacen/", async (req, res) => {
  const {id_cli, almacen} = req.query;
  if(!id_cli || !almacen || almacen.trim() === ''){
    return res.status(400).json({
      success: false,
      error: 'Faltan datos para procesar la solicitud'
    });
  }



  try {

    let queryConsultorios = `SELECT ac.id_almacen, ac.id_consultorio, c.descripcion AS consultorio
     from  almacenes_consultorio ac
     inner join consultorios c on c.id_consultorio = ac.id_consultorio
     where c.descripcion = ? and c.id_cli = ?`
    const consultorios = await retornarQuery(queryConsultorios, [almacen, id_cli]);

    if(consultorios.data.length === 0){
        return res.status(400).json({
            success: false,
            error: 'No se encontro el almacen'
        });
    }

  let query=`
    SELECT 
      e.id_estudio,
      e.descripcion AS insumo,
      am.id_insumo,
      am.id_almacen,
      c.descripcion AS consultorio,
      c.id_consultorio,
      e.id_cli,
      SUM(am.cantidad) AS cantidad
    FROM estudios e
    INNER JOIN almacen_movimientos am ON e.id_estudio = am.id_insumo
    INNER JOIN consultorios c ON c.id_consultorio = am.id_almacen
    WHERE 
      am.id_almacen = ?      
    GROUP BY 
      e.id_estudio,
      e.descripcion,
      am.id_insumo,
      am.id_almacen,
      c.id_consultorio,
      c.descripcion,
      e.id_cli;`;
  const insumos = await retornarQuery(query, [consultorios.data[0].id_almacen]);
    res.json({
      success: true,
      insumos: insumos.data,
    });
  } catch (error) {
    registrarErrorPeticion(req, error);
    res.status(500).json({
      success: false,
      message: "Error al procesar la solicitud",
      error: error.message,
    });
  }
})

module.exports = router;