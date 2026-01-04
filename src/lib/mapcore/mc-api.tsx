/// <reference path="../../types/MapCore.d.ts"/>
import React, { memo, useContext, useEffect, useRef, useState } from "react";
import MapCoreCallbacks, { CCameraUpdateCallback, CAsyncQueryCallback, CEditModeCallback, CAsyncOperationCallback }
    from './mc-callbacks';
import { useGesture, PinchState, DragState } from '@use-gesture/react';
import CreateCallbackClasses from "./mc-callbacks";
import { GetServerUrl, GetCapabilitiesUrl } from "./utils";

type PointValue = { Value: { z: number, x: number, y: number } };

/////////////////////////////////////////////////////////////////////////////////////////
// A class used to store the viewport data
/////////////////////////////////////////////////////////////////////////////////////////
export class SViewportData {
    viewport: MapCore.IMcMapViewport;
    editMode: MapCore.IMcEditMode;
    canvas: HTMLCanvasElement;
    aViewportTerrains: MapCore.IMcMapTerrain[];
    aLayers: MapCore.IMcMapLayer[];
    bCameraPositionSet: boolean;
    terrainCenter: MapCore.SMcVector3D;
    bSetTerrainBoxByStaticLayerOnly: boolean;
    terrainBox: MapCore.SMcBox;
    terrain: MapCore.IMcMapTerrain;
    constructor(_viewport: MapCore.IMcMapViewport, _editMode: MapCore.IMcEditMode) {
        this.viewport = _viewport;
        this.editMode = _editMode;
        this.canvas = _viewport.GetWindowHandle();
        this.aViewportTerrains = _viewport.GetTerrains();
        this.aLayers = !!this.aViewportTerrains && this.aViewportTerrains.length > 0
            ? this.aViewportTerrains[0].GetLayers() : null;
        this.terrainCenter = { x: 0, y: 0, z: 0 };
        this.bCameraPositionSet = false;
        this.bSetTerrainBoxByStaticLayerOnly = false;
    }
};
/////////////////////////////////////////////////////////////////////////////////////////

// Non-state global variables
var lastAction = {};                    // Used to store the last command sent.
var overlayManager: MapCore.IMcOverlayManager = null;              // MapCore's overlay manager
var overlay: MapCore.IMcOverlay = null;                     // Overlay on which objects are drawn
export var editMode: MapCore.IMcEditMode = null;                    // Currently active edit mode
var _device: MapCore.IMcMapDevice = null;                     // MapCore's interface to GPU
var viewport2D: MapCore.IMcMapViewport = null;                  // 2D Viewport object
var viewport3D: MapCore.IMcMapViewport = null;                  // 3D Viewport object
var editMode2D: MapCore.IMcEditMode = null;                  // 2D Edit mode
var editMode3D: MapCore.IMcEditMode = null;                  // 3D Edit mode
var is2DActive: boolean = false;                 // A flag set if 2D is active
var is3DActive: boolean = false;                 // A flag set if 3D is active
var layerCallback: MapCore.IMcMapLayer.IReadCallback = null;               // callback for asynchronous layer action
export var aViewports: SViewportData[] = [];                    // SViewportData table
var nMousePrevX: number = 0;                    // Last mouse X
var nMousePrevY: number = 0;                    // Last mouse Y
var mouseDownButtons: number = 0;               // mask of pressed mouse buttons
var terrainLayers: string[] = [];                 // layer identifiers of the terrain
var ellipseSchemesGPU: MapCore.IMcObjectScheme = null;           // GPU ellipse scheme
var testObjectsScheme: MapCore.IMcObjectScheme = null;           // Use to test randomly moving objects
var mapFootprintScheme: MapCore.IMcObjectScheme = null;          // Used to draw map footprints
var robotTrailScheme : MapCore.IMcObjectScheme = null;             // Simulation trail scheme
var simTrackScheme : MapCore.IMcObjectScheme = null;                // Simulated vehicle track
var navfixScheme : MapCore.IMcObjectScheme = null;                  // navfix position (from Robot's GPS)
var initialGuessScheme: MapCore.IMcObjectScheme = null;
var aObjects: {object: MapCore.IMcObject, location: MapCore.SMcVector3D}[] = [];                      // Randomally created objects;
var aFtObjects: MapCore.IMcObject[] = [];                    // Footprints map objects
var moveObjects: boolean = false;                // Are random objects move?
var mapSelectOpened : boolean = false;
var _layerIds : string [] = [];
var asyncOpsCallback : MapCore.IMcMapLayer.IAsyncOperationCallback;
var isCameraTrack = false;
var FirstCameraTrack = false;
var lastSelectedItem = 'Toggle way-points';
var lastObjectToRemove : MapCore.IMcObject = null;
export var editModeEvents     : MapCore.IMcEditMode.ICallback;
var lastFOV: number = 0;
var dayMode: boolean = true;
var defaultCenterPoint: MapCore.SMcVector3D | null = null;
var externalCrsEpsg: number = 0;
var externalWmtsLayersList: string = "";
var externalWmtsBaseUrl: string = "";


var rendered2D = false;
var rendered3D = false;
var initial2DViewScale: number = 1;

// memory usage logging frequency in seconds (0 - no logging), will be overwritten during parsing configuration file
let uMemUsageLoggingFrequency: number = 10;

// These variables are used to measure time between frames
let lastRenderTime: number = (new Date).getTime();
let lastMemUsageLogTime: number = (new Date).getTime();
let lastLayersValidityCheckTime: number = (new Date).getTime();

const NUM_OF_RANDOM_OBJECTS: number = 10000;    // Number of random rendered objects

let minPoint: PointValue = { Value: { z: 0, x: 0, y: 0 } }
let maxPoint: PointValue = { Value: { z: 0, x: 0, y: 0 } };

//////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Helper class to perfrom additional mapcore operations
//////////////////////////////////////////////////////////////////////////////////////////////////////////////
export class MapCoreHelper {
    converter : MapCore.IMcGridConverter = null;
    geoCrs : MapCore.IMcGridCoordinateSystem = null;
    utmCrs : MapCore.IMcGridCoordinateSystem = null;

    /// Constructor for the CViewportHelper class
    /// @param geoCrs - The EPSG code of the geographic coordinate system
    /// @param utmCrs - The EPSG code of the UTM coordinate system
    constructor(geoCrs: number, utmCrs: number)
    {
        let a = `epsg:${geoCrs}`;
        let b = `epsg:${utmCrs}`;
        this.geoCrs = MapCore.IMcGridGeneric.Create(a);
        this.utmCrs = MapCore.IMcGridGeneric.Create(b);
        this.converter = MapCore.IMcGridConverter.Create(this.geoCrs, this.utmCrs);
    }

    /// Convert a position from the geographic coordinate system to the UTM coordinate system
    /// @param pos - The position to convert
    /// @returns The converted position
    convertToUtm(pos: MapCore.SMcVector3D) : MapCore.SMcVector3D
    {
        return this.converter.ConvertAtoB(pos);
    }

    /// Convert a position from the UTM coordinate system to the geographic coordinate system
    /// @param pos - The position to convert
    /// @returns The converted position
    convertToGeo(pos: MapCore.SMcVector3D) : MapCore.SMcVector3D
    {
        return this.converter.ConvertBtoA(pos);
    }

    /// Set the initial location
    /// @param location - The initial location
    SetInitialLocation(location: MapCore.SMcVector3D)
    {
        defaultCenterPoint = location;
    }

    /// Get the initial location
    /// @returns The initial location
    GetInitialLocation() : MapCore.SMcVector3D
    {
        return defaultCenterPoint;
    }

    /// Set the 2D view scale
    /// @param scale - The scale to set
    SetCamera2DViewScale(scale: number)
    {
        if (viewport2D) {
            viewport2D.SetCameraScale(scale);
        }
        else {
            initial2DViewScale = scale;
        }
    }

    /// Destroy the CViewportHelper class
    destroy()
    {
        this.converter.Release();
    }

}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////
// The MapCore viewer component 
//

export type MapcoreAction = {
    action: string,
    layerIds?: string[],
    layerId?: string,
    frame? : string,
    mode?: string,
    count?: number,
    Value?: MapCore.SMcVector3D,
    cursorType?: MapCore.IMcEditMode.ECursorType,
    cameraTrack?: boolean,
    moveObjects?: boolean,
    posX? : number,
    posY? : number,
    posZ? : number,
    remoteUrl?: string,
    remoteBaseUrl?: string,
    remoteToken?: string,
    remoteWmtsTilingScheme?: string,
    remoteWmtsLayersList?: string,
    remoteType?: "WMS" | "WMTS" | "DTM" | "MODEL" | "WPS" | "WCS";
    remoteEpsg?: number;
}

export type layerNameAndDesc = {
    layerId: string,
    layerDesc: string,
    layerType: string
}

export interface Action {
    action: MapcoreAction    
    cursorPos: (position: MapCore.SMcVector3D) => void | null;
    crsUnits: "Geo" | "UTM";
    availableGroups: (groupNames : string[]) => void | null
    group: string | null;
    initialized : boolean;
    modelPath: string | null;
    modelFiles: string[] | null;
    availableLayers : (layers : layerNameAndDesc[]) => void | null
    mapStatus : (isDisplayed: boolean) => void | null
    onSelectedObject: (object: MapCore.IMcObject, isEdit: boolean) => void | null;
    onHeadingChange: (heading: number) => void | null;
    onExternalSourceReady: () => void | null;
}


const MapCoreViewer = ({ action, cursorPos, crsUnits, availableGroups, 
                            group, initialized, 
                            modelPath, modelFiles,
                            availableLayers, mapStatus, 
                            onSelectedObject, onHeadingChange, 
                            onExternalSourceReady}: Action) => {
    // context used by the viewer
    const [mapServer, setMapServer] = useState<MapCore.IMcMapLayer.SServerLayerInfo[] | null>(null);
    const [isMapCoreInitialized, setIsMapCoreInitialized] = useState<boolean>(false);
    const [selectedItem, setSelectedItem] = useState<MapCore.IMcObject | null>(null);
    const [point, setPoint] = useState<MapCore.SMcVector3D | null>(null);
    const [clicked, setClicked] = useState<boolean>(false);
    const [layers, setLayers] = useState<string[]>([]);
    const [lastWidth, setLastWidth] = useState<number>(0)
    const [lastHeight, setLastHeight] = useState<number>(0)
    const [mapDisplayed, setMapDisplayed] = useState(false);
    const [units, setUnits] = useState<"Geo"|"UTM">("UTM");
    const unitsRef = useRef<"Geo" | "UTM">(units);

    const OBJ_ELLIPSE_ID: number = 1;
    const OBJ_SIMTRAIL_ID: number = 2;
    const OBJ_SIMTRACK_ID: number = 3;
    const OBJ_NAVFIX_ID: number = 4;
    const OBJ_INITIAL_GUESS_ID: number = 5;
    const OBJ_NAV_BOUNDING_BOX: number = 6;
    const OBJ_UTM_GOAL_ID: number = 7;


    const targetRef = useRef(null);    

    const [wpRemoveConfirm, setWpRemoveConfirm] = useState(false);
    //const [sidePanelData, setSidePanelData] = useState<SidePanelData[]>([]);  
    const [sofOperPanelActive, setSofOperPanelActive] = useState<boolean>(false);
    const [sofState, setSofState] = useState<string>("PLANNING");

    // States for pintch transofrms
    const [_canvases, _setCanvases] = useState<number[]>([]);
    const [_transformations, _setTransformations] = 
        useState<{ [key: number]: { scale: number; x: number; y: number } }>({});

    const bind : any = useGesture({
        onPinch: ({ offset: [d], memo, args: [id] }) => {
            const newScale = (memo || _transformations[id].scale) * d;
            _setTransformations((prev) => ({ ...prev, [id]: { ...prev[id], scale: newScale } }));
            return memo || _transformations[id].scale;
        },
        onDrag: ({ offset: [x, y], args: [id] }) => {
            _setTransformations((prev) => ({ ...prev, [id]: { ...prev[id], x, y } }));
        },
        });


    const init =() => {
        startFunction();
    }

    const addCanvas = () : number => {
        const newId =_canvases.length;
        _setCanvases([..._canvases, newId]);
        _setTransformations({..._transformations, [newId]: {scale: 1, x:0, y:0}});
        return newId;
    }
   

    ///////////////////////////////////////////////////////////////////////
    // Called when the component is initiated - register resize event and 
    // start mapcore
    //////////////////////////////////////////////////////////////////////
    useEffect(() => {

        addCanvas();
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries)
            {
                // log event
                console.log('Element resized: ', entry.target);
                console.log('New dimensions : ', entry.contentRect.width, entry.contentRect.height);

                // Use window dimensions if container has zero height
                const width = entry.contentRect.width || window.innerWidth;
                const height = entry.contentRect.height || window.innerHeight;

                setLastWidth(width);
                setLastHeight(height);
                resizeCanvas(width, height);
            }            
        });

        if (targetRef.current) observer.observe(targetRef.current);
        //window.addEventListener('resize', resizeCanvas);
      
      
        window.addEventListener('keyup', HandleKeyUp, false);
        setMapDisplayed(false);
      
        return () => {
          observer.disconnect();
          //window.removeEventListener('resize', resizeCanvas);
          window.removeEventListener('keyup', HandleKeyUp, false);
        };
      }, []);

    //     window.addEventListener("keyup", HandleKeyUp, false);

    useEffect(() => {
        setUnits(crsUnits);
    },[crsUnits]);

    useEffect(() => {
        unitsRef.current = units;        
    },[units]);

    useEffect(() => {
        if (initialized)
        {
            console.log("MapCore will Initialize now!")
            init();
        }
    }, [initialized])

    useEffect(() => {
        if (action.action !== "")
        {
            compareAction()
        }
    }, [action])

    useEffect(() => {
        if (mapStatus)
        {
            mapStatus(mapDisplayed);
        }
    }, [mapDisplayed]);

    useEffect(() => {
        if (mapServer && mapServer.length > 0)
        {
            let groups : string[] = [];
            mapServer.forEach((layer) => {
                groups.push(...layer.astrGroups);
            })

            let groupNames = Array.from(new Set(groups));
            availableGroups(groupNames) ;
            
        }
    }, [mapServer])

    useEffect(() => {
        if (isExternalGroup())
        {
            console.log('External group. Skipping group layers setup...');
        }
        else if (group)
        {
            const groupLayers = getLayersByGroup(group);
            setLayers(groupLayers.map((layer) => layer.strLayerId));
            if (availableLayers)
            {
                let layersData = groupLayers.map((layer) => {
                    let retVal : layerNameAndDesc = {
                        layerId: layer.strLayerId, 
                        layerDesc: layer.strTitle,
                        layerType: layer.strLayerType};
                    return retVal;
                });
                // Get all titles
                let titles = layersData.map((value) => value.layerDesc);
                let dups = titles.filter((value, index, self) => self.indexOf(value) !== index);

                dups.forEach((layerDesc, index) => {
                    let j = 1;
                    for (let i=0; i<layersData.length; i++)
                    {
                        if (layersData[i].layerDesc === layerDesc)
                        {                            
                            if (j > 1) {layersData[i].layerDesc = `${layerDesc} (${j})`};
                            j++;
                        }
                    }
                });

                availableLayers(layersData);
            }
        }
    }, [group]);

    function getCurrentDimension() {
        return {
            width: window.innerWidth,
            height: window.innerHeight
        }
    };


    ///////////////////////////////////////////////////////////////////////
    // Checks if the group is an external group
    ///////////////////////////////////////////////////////////////////////
    const isExternalGroup = () => {
        if (group?.startsWith('https://tile.googleapis.com/v1/3dtiles/') || 
            group?.includes('data/maps/'))
        {
            return true;
        }
        else
        {
            return false;
        }
    };

    ///////////////////////////////////////////////////////////////////////
    // Everything starts here - MapCore start function.
    ///////////////////////////////////////////////////////////////////////
    const startFunction = () => 
    {
        // Check if MapCore and IMcMapDevice are fully loaded
        if (!window.MapCore || !window.MapCore.IMcMapDevice) 
        {
            console.warn('MapCore.IMcMapDevice not yet available, retrying...')
            // Retry after a short delay
            setTimeout(() => {
                startFunction()
            }, 100)
            return
        }        
        
        if (!!!_device) {
            initDevice();  // Initialize mapcore's device
        }
    }

    ///////////////////////////////////////////////////////////////////////////
    // Loads mesh resources from a given folder and resource name
    ///////////////////////////////////////////////////////////////////////////
    const loadMeshResources = async (folderName : string, fileNames : string[], resourceName : string) => {
        if (_device) 
        {
            let results = [];
            MapCore.IMcMapDevice.CreateFileSystemDirectory("models");
            const downloadPromises = fileNames.map(async (fileName) => {
                const response = await fetch(`${folderName}/${fileName}`);
                if (!response.ok) {
                    console.error(`Failed to fetch ${fileName}`);
                    return;
                }
                const arrayBuffer = await response.arrayBuffer();
                const uint8Array = new Uint8Array(arrayBuffer);
                MapCore.IMcMapDevice.CreateFileSystemFile(`models/${fileName}`, uint8Array);
                console.log(`Loaded ${fileName} (${uint8Array.length} bytes) into models folder`);
                results.push(`models/${fileName}`);
            });
            await Promise.all(downloadPromises);
            MapCore.IMcMapDevice.LoadResourceGroup(resourceName, ["models"], MapCore.IMcMapDevice.EResourceLocationType.ERLT_FOLDER);
        }
    }

    ///////////////////////////////////////////////////////////////////////////
    // Analyzes the getCapabilities request and retuns the coordinate system
    // (CRS) used by each layer
    ///////////////////////////////////////////////////////////////////////////
    const getCrsByLayers = (checkedLayers : string[] | null = null) => {
        if (!mapServer) {
            return [];
        }

        let result : MapCore.IMcGridCoordinateSystem[] = [];        
        checkedLayers.forEach((layerId: string) => {
            mapServer.forEach((layer: MapCore.IMcMapLayer.SServerLayerInfo) => {
                layer.pCoordinateSystem.AddRef();
                if (layer.strLayerId === layerId) {
                    let existing = result.filter(
                            (crs : MapCore.IMcGridCoordinateSystem) => crs.IsEqual(layer.pCoordinateSystem));
                    if (existing.length === 0) {
                        result.push(layer.pCoordinateSystem);
                    }
                    else {
                        layer.pCoordinateSystem.Release();
                    }
                }
            });
    
        });

        return result;
    };

    ///////////////////////////////////////////////////////////////////////////
    // Returns GetCapabilities layer information by a given layerId
    ///////////////////////////////////////////////////////////////////////////
    const getLayerById = (layerId: string) : MapCore.IMcMapLayer.SServerLayerInfo => 
    {      
        if (!mapServer) {
            return null;
        }

        let result = null;
        
        mapServer.forEach((layer: MapCore.IMcMapLayer.SServerLayerInfo) => 
        {
            if (layer.strLayerId === layerId) {
                result = layer;
            }
        });

        return result;
    };

    ///////////////////////////////////////////////////////////////////////////
    // Returns CRS's used by a set of layers
    ///////////////////////////////////////////////////////////////////////////
    const getTerrainCrs = () => {
        if (isExternalGroup())
        {
            if (externalCrsEpsg === 0   )
            {
                externalCrsEpsg = 4326;
            }
            let crs = MapCore.IMcGridGeneric.Create(`epsg:${externalCrsEpsg}`);
            crs.AddRef();
            return crs;
        }
        else
        {
            let layersCrs = getCrsByLayers(terrainLayers);
            if (layersCrs.length !== 1) {
                return null;
            }
            return layersCrs[0];
        }
    }

    /////////////////////////////////////////////////////////////////////////////
    // Returns the layer data by it's group
    /////////////////////////////////////////////////////////////////////////////
    const getLayersByGroup = (groupName : string) =>
    {
        if (isExternalGroup())
        {
            return [];
        }
        else
        {
            return mapServer.filter((layer) => layer.astrGroups.includes(groupName));
        }
    }

    /////////////////////////////////////////////////////////////////////////////
    // A function that generates the map layers and viewports 
    // terrain  - A terrain object
    // mode - "2D" for two dimentions map, "3D" for three dimentions map
    ////////////////////////////////////////////////////////////////////////////

    const CreateMapLayersAndViewports = (terrain: MapCore.IMcMapTerrain, mode: string) => {

        let currCanvas: HTMLCanvasElement;

        // Create the overlay manager
        if (overlayManager == null) {
            overlayManager = MapCore.IMcOverlayManager.Create(terrain!.GetCoordinateSystem());
            overlayManager.AddRef();
            overlay = MapCore.IMcOverlay.Create(overlayManager);
            overlay.SetDrawPriority(100);
        }

        document.getElementById('Canvases')!.style.transform = 'none';


        // In case of first (or single) view, Create a canvas HTML Element and add event listerners to it's mouse events.
        if (aViewports.length === 0) {          
            currCanvas = document.createElement('canvas');
            currCanvas.id = 'InternalCanvas';
            currCanvas.addEventListener("wheel", handleMouseWheel, false);
            currCanvas.addEventListener("pointermove", handlePointerMove, false);
            currCanvas.addEventListener("pointerdown", handlePointerDown, false);
            currCanvas.addEventListener("pointerup", handlePointerUp, false);
            currCanvas.addEventListener("dblclick", HandleDblClick, false);            

            currCanvas.style.transform = 
                `translate(${_transformations[0].x, _transformations[0].y}px) scale(${_transformations[0].scale})`;
            const boundHandlers = bind(0);
            Object.keys(boundHandlers).forEach((key) => {
                currCanvas.addEventListener(key, boundHandlers[key]);
              });

            currCanvas.style.width = '100%';
            currCanvas.style.height = '100%'
            currCanvas.style.display = 'block';

        }
        else // Otherwise just maps the existing canvas
        {
            currCanvas = aViewports[0].canvas;
        }

        // Create a viewport
        let vpCreateData = new MapCore.IMcMapViewport.SCreateData(
            mode === '2D' ? MapCore.IMcMapCamera.EMapType.EMT_2D :
                MapCore.IMcMapCamera.EMapType.EMT_3D);

        vpCreateData.pDevice = _device!;
        vpCreateData.pCoordinateSystem = terrain!.GetCoordinateSystem();
        vpCreateData.pOverlayManager = overlayManager;
        vpCreateData.hWnd = currCanvas;
        vpCreateData.bShowGeoInMetricProportion = true;
        // if (maxScaleFactor > 0) {
        //     vpCreateData.maxScaleFactor = maxScaleFactor;
        // }//Property 'maxScaleFactor' does not exist on type 'SCreateData'.
        let viewport: MapCore.IMcMapViewport = MapCore.IMcMapViewport.Create(null, vpCreateData, [terrain!]);
        viewport.AddRef();

        // Create edit mode 
        editMode = MapCore.IMcEditMode.Create(viewport);
        editModeEvents = new CEditModeCallback();
        editMode.SetEventsCallback(editModeEvents);

        // Register viewport asynchronous callbacks
        let callback: any = new CCameraUpdateCallback();
        viewport.AddCameraUpdateCallback(callback);

        // Set initial scale
        if (mode === '3D') {
            // viewport.SetScreenSizeTerrainObjectsFactor(1.5);
            viewport.SetCameraRelativeHeightLimits(3, 10000, true);
        }
        else {
            viewport.SetVector3DExtrusionVisibilityMaxScale(50);
            //viewport.SetCameraScale(8); //TBD check for initial scale
        }

        viewport.SetBackgroundColor(new MapCore.SMcBColor(70, 70, 70, 255));

        // set object delays for optimazing rendering objects
        viewport.SetObjectsDelay(MapCore.IMcMapViewport.EObjectDelayType.EODT_VIEWPORT_CHANGE_OBJECT_UPDATE, true, 50);
        viewport.SetObjectsDelay(MapCore.IMcMapViewport.EObjectDelayType.EODT_VIEWPORT_CHANGE_OBJECT_CONDITION, true, 50);
        viewport.SetObjectsDelay(MapCore.IMcMapViewport.EObjectDelayType.EODT_VIEWPORT_CHANGE_OBJECT_SIZE, true, 5);
        viewport.SetObjectsDelay(MapCore.IMcMapViewport.EObjectDelayType.EODT_VIEWPORT_CHANGE_OBJECT_HEIGHT, true, 50);

        // set objects movement threshold
        viewport.SetObjectsMovementThreshold(1);

        // set terrain cache
        if (terrain != null) {
            viewport.SetTerrainNumCacheTiles(terrain, false, 300);
            viewport.SetTerrainNumCacheTiles(terrain, true, 300);
        }

        // Add the data into a viewport data table. in case of 2D and 3D viewports,
        // The first entry will be 2D and second 3D.
        let viewportData: SViewportData = new SViewportData(viewport, editMode);
        viewportData.canvas.width = lastWidth;
        viewportData.canvas.height = lastHeight;

        if (mode === '2D') {
            viewport2D = viewport;
            editMode2D = editMode;
            is2DActive = true;
            is3DActive = false;
            if (aViewports.length === 1) {
                aViewports.splice(0, 0, viewportData);
            }
            else {
                aViewports.push(viewportData);
            }
        }
        else {
            viewport3D = viewport;
            editMode3D = editMode;
            is2DActive = false;
            is3DActive = true;
            aViewports.push(viewportData);
        }

        // Set the canvas parent node.
        document.getElementById('Canvases')!.appendChild(currCanvas);

        TrySetTerrainBox();
        // Finally, resize the canvas, and set the terrain bounding box
        // resizeCanvas();

        if (isExternalGroup() && externalWmtsBaseUrl)
        {
            // Hide all 3D Model layers in 2D view
            if (mode === '2D')
            {
                terrain.GetLayers().forEach((layer) => {
                    if (layer.GetLayerType() === MapCore.IMcRaw3DModelMapLayer.LAYER_TYPE ||
                        layer.GetLayerType() === MapCore.IMcNativeServer3DModelMapLayer.LAYER_TYPE ||
                        layer.GetLayerType() === MapCore.IMcNative3DModelMapLayer.LAYER_TYPE)
                    {
                        layer.SetVisibility(false, viewport2D);
                    }
                });
            }   
        }


        requestAnimationFrame(() =>  {resizeCanvas(lastWidth, lastHeight)});
        
        // if (targetRef.current)
        // {
        //     targetRef.current.style.width = targetRef.current.offsetWidth + 1 + "px";
        //     requestAnimationFrame(() => {
        //         targetRef.current.style.width = "";
        //     })
        // }

        setMapDisplayed(true);
        mapStatus?.(true);

        return;
    }

    

    ///////////////////////////////////////////////////////////////////////////
    // Caclulates height range of viewport's area
    ///////////////////////////////////////////////////////////////////////////
    const CalcMinMaxHeights = () => {
        let viewport: MapCore.IMcMapViewport = is2DActive ? viewport2D : viewport3D;
        if (viewport == null) { return };

        let minHeight: number = 0;
        let maxHeight: number = 700;
        let fp: MapCore.IMcMapCamera.SCameraFootprintPoints = viewport.GetCameraFootprint();
        if (fp.bUpperLeftFound && fp.bUpperRightFound && fp.bLowerRightFound && fp.bLowerLeftFound) {

            if (viewport.GetExtremeHeightPointsInPolygon([fp.UpperLeft, fp.UpperRight, fp.LowerRight, fp.LowerLeft], maxPoint, minPoint)) {
                minHeight = minPoint.Value.z;
                maxHeight = maxPoint.Value.z;
                if (maxHeight <= minHeight + 1) {
                    maxHeight = minHeight + 1;
                }
            }
        }
        return { minHeight: minHeight, maxHeight: maxHeight };
    }


    //////////////////////////////////////////////////////////////////////////////////////////
    // Toggles DTM-visualization (height map) mode
    /////////////////////////////////////////////////////////////////////////////////////////
    const DoDtmVisualization = () => {
        let viewport: MapCore.IMcMapViewport = is2DActive ? viewport2D : viewport3D;
        if (viewport == null) { return };
        if (!viewport.GetDtmVisualization()) {
            let result = CalcMinMaxHeights();
            let DtmVisualization: MapCore.IMcMapViewport.SDtmVisualizationParams = new MapCore.IMcMapViewport.SDtmVisualizationParams();
            MapCore.IMcMapViewport.SDtmVisualizationParams.SetDefaultHeightColors(DtmVisualization, result?.minHeight, result?.maxHeight);
            DtmVisualization.bDtmVisualizationAboveRaster = true;
            DtmVisualization.uHeightColorsTransparency = 120;
            DtmVisualization.uShadingTransparency = 255;
            viewport.SetDtmVisualization(true, DtmVisualization);
        }
        else {
            viewport.SetDtmVisualization(false);
        }
    }

    ////////////////////////////////////////////////////////////////////////////////////////////
    // Perform moveTo set by the footer poistion components
    const moveTo = (pos: MapCore.SMcVector3D) => {
        let crs = viewport2D.GetCoordinateSystem();
        let geoCrs = MapCore.IMcGridGeneric.Create("epsg:4326");
        let conv = MapCore.IMcGridConverter.Create(geoCrs, crs);
        
        let worldPosGeo = new MapCore.SMcVector3D(pos.x * 100000, pos.y * 100000, pos.z);
        let worldPos = conv.ConvertAtoB(worldPosGeo);

        viewport2D.SetCameraPosition(worldPos);
    }

    ////////////////////////////////////////////////////////////////////////////////////////////
    // Convert the mouse position to grouns location and send it to the footer component
    const showCursorPosition = (e: PointerEvent, viewport: MapCore.IMcMapViewport) => {
        let worldPos: any = {};//according to map-core
        let screenPos: MapCore.SMcVector3D = new MapCore.SMcVector3D(e.offsetX, e.offsetY, 0);
        let bIntersect: boolean = false;


        // Convert screen to world location according to the viewport's map type
        if (viewport.GetMapType() === MapCore.IMcMapCamera.EMapType.EMT_2D) {
            bIntersect = viewport.ScreenToWorldOnPlane(screenPos, worldPos);
        }
        else {
            bIntersect = viewport.ScreenToWorldOnTerrain(screenPos, worldPos);
        }

        // Send the data to the footer components
        if (bIntersect) {
            if (unitsRef.current === "UTM")
            {
                let utmPos = new MapCore.SMcVector3D(
                    Math.round(worldPos.Value.x),
                    Math.round(worldPos.Value.y),
                    Math.round(worldPos.Value.z)
                );
                cursorPos?.(utmPos);
            }
            else
            {
                let geoCrs : MapCore.IMcGridGeneric = MapCore.IMcGridGeneric.Create('epsg:4326');
                let crs = viewport.GetCoordinateSystem();
                if (crs.IsEqual(geoCrs))
                {
                    let geoPos = worldPos.Value;
                    geoPos.x /= 100000;
                    geoPos.y /= 100000;

                    geoPos.x = Math.round(geoPos.x * 1e5) / 1e5;
                    geoPos.y = Math.round(geoPos.y * 1e5) / 1e5;
                    geoPos.z = Math.round(geoPos.z * 1e5) / 1e5;
                    
                    cursorPos?.(geoPos);
                }
                else
                {
                    let conv = MapCore.IMcGridConverter.Create(crs, geoCrs);
                    
                    let geoPos = conv.ConvertAtoB(worldPos.Value);
                    geoPos.x = geoPos.x / 100000.0;
                    geoPos.y = geoPos.y / 100000.0;

                    geoPos.x = Math.round(geoPos.x * 1e5) / 1e5;
                    geoPos.y = Math.round(geoPos.y * 1e5) / 1e5;
                    geoPos.z = Math.round(geoPos.z * 1e5) / 1e5;

                    cursorPos?.(geoPos);
                    conv.Release();
                    geoCrs.Release();
                }
            }
           
        }
        else {
            cursorPos?.(null);
        }

    };

    const HandleKeyUp = (e: KeyboardEvent) =>
    {
        if (e.key === 'Escape' && editMode?.IsEditingActive())
        {
            editMode?.OnKeyEvent(MapCore.IMcEditMode.EKeyEvent.EKE_ABORT, true);
        }
    }

    //----------------------------------------------------------------------------------------------------------------------
    // Mouse event handlers
    //----------------------------------------------------------------------------------------------------------------------

    // +-buttons handler
    const handleZoom = (delta : number) => {

        let viewport: MapCore.IMcMapViewport = is2DActive ? viewport2D : viewport3D;

        if (viewport.GetMapType() === MapCore.IMcMapCamera.EMapType.EMT_3D) {
            viewport.MoveCameraRelativeToOrientation(new MapCore.SMcVector3D(0, 0, delta / 8.0), true);
        }
        else {
            let fScale: number = viewport.GetCameraScale();

            if (delta > 0) {
                viewport.SetCameraScale(fScale / 1.25);
            }
            else {
                viewport.SetCameraScale(fScale * 1.25);
            }

            if (viewport.GetDtmVisualization()) {
                DoDtmVisualization();
                DoDtmVisualization();
            }
        }
    }

    // Mouse wheel handler
    const handleMouseWheel = (e: WheelEvent) => {

        let bHandled: any = {};
        let eCursor: any = {};//according to map-core
        let wheelDelta: number = - e.deltaY;
        let viewport: MapCore.IMcMapViewport = is2DActive ? viewport2D : viewport3D;

        editMode?.OnMouseEvent(
            MapCore.IMcEditMode.EMouseEvent.EME_MOUSE_WHEEL,
            new MapCore.SMcPoint(0, 0), e.ctrlKey, wheelDelta, bHandled, eCursor);
        if (bHandled.Value || viewport == null) {
            return;
        }

        let factor: number = (e.shiftKey ? 10 : 1);

        if (viewport.GetMapType() === MapCore.IMcMapCamera.EMapType.EMT_3D) {
            viewport.MoveCameraRelativeToOrientation(new MapCore.SMcVector3D(0, 0, wheelDelta / 8.0 * factor), true);
        }
        else {
            let fScale: number = viewport.GetCameraScale();

            if (wheelDelta > 0) {
                viewport.SetCameraScale(fScale / 1.25);
            }
            else {
                viewport.SetCameraScale(fScale * 1.25);
            }

            if (viewport.GetDtmVisualization()) {
                DoDtmVisualization();
                DoDtmVisualization();
            }
        }

        //showCursorPosition(e, viewport)

        e.preventDefault?.();
        if (e.stopPropagation) e.stopPropagation();


    }

    // Mouse move handler
    const handlePointerMove = (e: PointerEvent) => {
        let viewport: MapCore.IMcMapViewport = is2DActive ? viewport2D : viewport3D;
        if (viewport == null || viewport.GetWindowHandle() !== e.target) {
            return;
        }

        let EventPixel: MapCore.SMcPoint = new MapCore.SMcPoint(e.offsetX, e.offsetY);
        if (e.buttons <= 1) {
            let bHandled: any = {};
            let eCursor: any = {};//according to map-core
            editMode!.OnMouseEvent(e.buttons === 0 ?
                MapCore.IMcEditMode.EMouseEvent.EME_MOUSE_MOVED_BUTTON_UP :
                MapCore.IMcEditMode.EMouseEvent.EME_MOUSE_MOVED_BUTTON_DOWN,
                EventPixel, e.ctrlKey, 0, bHandled, eCursor);
            if (bHandled.Value) {
                showCursorPosition(e, viewport);
                e.preventDefault?.();
                //e.cancelBubble = true;
                if (e.stopPropagation) e.stopPropagation();
                return;
            }
        }
        if (e.buttons === 4)
        {
            HandleDblClick(e);
            e.stopPropagation();
            return;
        }

        if (e.buttons === 1) {
            if (nMousePrevX !== 0) {
                let factor = (e.shiftKey ? 10 : 1);
                if (viewport.GetMapType() === MapCore.IMcMapCamera.EMapType.EMT_3D) {
                    if (e.ctrlKey) {
                        viewport.MoveCameraRelativeToOrientation(
                            new MapCore.SMcVector3D((nMousePrevX - EventPixel.x) / 2.0 * factor, -
                                (nMousePrevY - EventPixel.y) / 2.0 * factor, 0), false);
                    }
                    else {
                        viewport.RotateCameraRelativeToOrientation(
                            (nMousePrevX - EventPixel.x) / 2.0, - (nMousePrevY - EventPixel.y) / 2.0, 0);
                    }
                }
                else {
                    if (e.ctrlKey) {
                        viewport.SetCameraOrientation((nMousePrevX - EventPixel.x) / 2.0,
                            MapCore.FLT_MAX, MapCore.FLT_MAX, true);
                    }
                    else {
                        viewport.ScrollCamera((nMousePrevX - EventPixel.x) * factor, (nMousePrevY - EventPixel.y) * factor);
                    }
                }

                e.preventDefault?.();
                //e.cancelBubble = true;
                if (e.stopPropagation) e.stopPropagation();
            }

            if (onHeadingChange) {
                let yaw : any = {};
                viewport.GetCameraOrientation(yaw);
                onHeadingChange(yaw.Value);
            }
        }

        showCursorPosition(e, viewport);        

        nMousePrevX = EventPixel.x;
        nMousePrevY = EventPixel.y;
    }

    // Mouse down handler
    const handlePointerDown = (e: PointerEvent) => {
        let editMode: MapCore.IMcEditMode = is2DActive ? editMode2D : editMode3D;
        let viewport: MapCore.IMcMapViewport = is2DActive ? viewport2D : viewport3D;

        if (viewport == null || editMode == null) {
            return;
        }

        if (editMode != null && editMode.IsEditingActive()) {
            // EditMode is active: don't change active viewport, but ignore click on non-active one
            if (viewport.GetWindowHandle() !== e.target) {
                return;
            }

            if (e.buttons === 4) // Middle press - use as double click
            {
                HandleDblClick(e);
                e.preventDefault();
                return;
            }
        }

        let EventPixel: MapCore.SMcPoint = new MapCore.SMcPoint(e.offsetX!, e.offsetY!);
        mouseDownButtons = e.buttons;
        if (e.buttons === 1) {
            let bHandled: any = {};
            let eCursor: any = {};//according to map-core
            editMode.OnMouseEvent(MapCore.IMcEditMode.EMouseEvent.EME_BUTTON_PRESSED,
                EventPixel, e.ctrlKey, 0, bHandled, eCursor);
            if (bHandled.Value) {
                e.preventDefault?.();
                //e.cancelBubble = true;
                if (e.stopPropagation) e.stopPropagation();
                return;
            }

            if (onHeadingChange) {
                let yaw : any = {};
                viewport.GetCameraOrientation(yaw);
                onHeadingChange(yaw.Value);
            }
    
            nMousePrevX = EventPixel.x;
            nMousePrevY = EventPixel.y;
        }
       
        e.preventDefault?.();
        //e.cancelBubble = true;
        if (e.stopPropagation) e.stopPropagation();

    }

    // MosueUp event handler
    const handlePointerUp = (e: PointerEvent) => {
        let viewport: MapCore.IMcMapViewport = is2DActive ? viewport2D : viewport3D;
        if (viewport == null || viewport.GetWindowHandle() !== e.target) {
            return;
        }

        let EventPixel: MapCore.SMcPoint = new MapCore.SMcPoint(e.offsetX, e.offsetY);
        let buttons: number = mouseDownButtons & ~e.buttons;
        if (buttons === 1) {
            let bHandled: any = {};
            let eCursor = {};
            editMode!.OnMouseEvent(MapCore.IMcEditMode.EMouseEvent.EME_BUTTON_RELEASED, EventPixel, e.ctrlKey!, 0, bHandled, eCursor);
            if (bHandled.Value) {
                e.preventDefault?.();
                if (e.stopPropagation) e.stopPropagation();
                //return;
            }

            if (onHeadingChange) {
                let yaw : any = {};
                viewport.GetCameraOrientation(yaw);
                onHeadingChange(yaw.Value);
            }
        }
    }

    // Mosue double click event handler
    const HandleDblClick = (e: MouseEvent) => {
        let viewport: MapCore.IMcMapViewport = is2DActive ? viewport2D : viewport3D;
        if (viewport == null || viewport.GetWindowHandle() !== e.target) {
            return;
        }

        let EventPixel: MapCore.SMcPoint = new MapCore.SMcPoint(e.offsetX, e.offsetY);
        // let buttons: number = mouseDownButtons & ~e.buttons;
        // if (buttons === 1) {
            let bHandled: any = {};
            let eCursor = {};
            let bEditActive: boolean = editMode!.IsEditingActive();
            editMode!.OnMouseEvent(MapCore.IMcEditMode.EMouseEvent.EME_BUTTON_DOUBLE_CLICK, EventPixel, e.ctrlKey!, 0, bHandled, eCursor);
            if (bHandled.Value) {
                e.preventDefault?.();
                //e.cancelBubble = true;
                if (e.stopPropagation) e.stopPropagation();
                if (bEditActive) return;
                //return;
            }
        // }

        if (!(editMode!.IsEditingActive())) {
            handleContextMenu(EventPixel.x, EventPixel.y, false);
            return;
        }

    }

    // 
    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    ////////////////////////////////////////////////////////////////////////////////////////////
    // Rotate the camera to north
    ///////////////////////////////////////////////////////////////////////////////////////////
    const RotateToNorth = () => {
        let viewport: MapCore.IMcMapViewport = is2DActive ? viewport2D : viewport3D;
        if (viewport == null) {
            return;
        }

        let pfYaw : any = {};
        viewport.GetCameraOrientation(pfYaw);
        pfYaw.Value = 0;
        viewport.SetCameraOrientation(pfYaw.Value);
    }

    ////////////////////////////////////////////////////////////////////////////////////////////
    // Set the cursor type
    ///////////////////////////////////////////////////////////////////////////////////////////
    const setCursor = (eCursor : MapCore.IMcEditMode.ECursorType) =>
    {
        switch (eCursor) {
            case MapCore.IMcEditMode.ECursorType.ECT_DEFAULT_CURSOR:
                document.body.style.cursor = 'default';
                break;
            case MapCore.IMcEditMode.ECursorType.ECT_DRAG_CURSOR:
                document.body.style.cursor = 'grab';
                break;
            case MapCore.IMcEditMode.ECursorType.ECT_MOVE_CURSOR:
                document.body.style.cursor = 'move';
                break;
            case MapCore.IMcEditMode.ECursorType.ECT_EDIT_CURSOR:
                document.body.style.cursor = 'pointer';
                break;
        }
    }

    ////////////////////////////////////////////////////////////////////////////////////////////
    // Creates a terriain from a set of grid coordinateobjects (CRS mapcore objects) 
    // and layer Id's
    ///////////////////////////////////////////////////////////////////////////////////////////
    const createTerrain = (grid: MapCore.IMcGridCoordinateSystem, layerIds: string[], 
                          remoteUrl?: string, remoteToken?: string, remoteBaseUrl?: string, remoteWmtsLayersList?: string,
                          remoteWmtsTilingScheme?: string,
                          remoteType?: "WMS" | "WMTS" | "DTM" | "MODEL" | "WPS" | "WCS") => {
        let activeLayers: MapCore.IMcMapLayer[] = [];
        
        // Reset the rendered flags
        rendered2D = false;
        rendered3D = false;

        if (remoteType && remoteType === "MODEL")
        {
            const layerRequestParams : MapCore.SMcKeyStringValue[] = 
                [{strKey: "key", strValue: remoteToken!}];
            if (remoteBaseUrl) 
            {
                externalWmtsBaseUrl = remoteBaseUrl;
                externalWmtsLayersList = remoteWmtsLayersList;
                let params : MapCore.IMcMapLayer.SWMTSParams = new MapCore.IMcMapLayer.SWMTSParams();
                params.bUseServerTilingScheme = true;
                params.pCoordinateSystem = getTerrainCrs();
                params.pReadCallback = layerCallback!;
                params.strImageFormat = "jpeg";
                params.strLayersList = remoteWmtsLayersList;
                params.strServerURL = remoteBaseUrl;
                params.strServerCoordinateSystem = remoteWmtsTilingScheme;
                let baseLayer = MapCore.IMcWebServiceRasterMapLayer.Create(params);
                activeLayers.push(baseLayer);
            }
            
            let currLayer = MapCore.IMcRaw3DModelMapLayer.Create(
                    remoteUrl!, getTerrainCrs(), false, 
                    null, 0.0, layerCallback!, layerRequestParams);
            activeLayers.push(currLayer);
        }
        else
        {
            _layerIds = layerIds;
            layerIds.forEach((layerId: string) => {
                // get layer full information and Generate layer Id URLs
                let layer = getLayerById(layerId);
                let currLayer: MapCore.IMcMapLayer;
                let layerStr: string = `${GetServerUrl}/${layerId}`;

                // Create the layer
                switch (layer.strLayerType) {
                    case 'MapCoreServerRaster':
                        currLayer = MapCore.IMcNativeServerRasterMapLayer.Create(layerStr, layerCallback!);
                        break;

                    case 'MapCoreServerDTM':
                        currLayer = MapCore.IMcNativeServerDtmMapLayer.Create(layerStr, layerCallback!);
                        break;

                    case 'MapCoreServer3DModel':
                        currLayer = MapCore.IMcNativeServer3DModelMapLayer.Create(layerStr, layerCallback!);
                        break;

                    case 'MapCoreServerVector':
                        currLayer = MapCore.IMcNativeServerVectorMapLayer.Create(layerStr, layerCallback!);
                        break;

                    case 'MapCoreServerVector3DExtrusion':
                        currLayer = MapCore.IMcNativeServerVector3DExtrusionMapLayer.Create(layerStr, layerCallback!);
                        break;

                    case 'MapCoreServerTraversability':
                        currLayer = MapCore.IMcNativeServerTraversabilityMapLayer.Create(layerStr, layerCallback!);
                        break;

                    case 'MapCoreServerMaterial':
                        currLayer = MapCore.IMcNativeServerMaterialMapLayer.Create(layerStr, layerCallback);
                        break;

                    default:
                        return null;
                }
                activeLayers.push(currLayer);
            });
        }

        // Generate a terrain from the layers and return it.
        let terrain: MapCore.IMcMapTerrain = MapCore.IMcMapTerrain.Create(grid, activeLayers);
        terrain.AddRef();
        // Set draw priority if not zero

        if (!isExternalGroup()) {
            for (let i = 0; i<activeLayers.length; i++)
            {
                let priority : number = 0;
                let layerDesc = getLayerById(layerIds[i]);

                if (layerDesc && layerDesc.nDrawPriority !== 0)
                {
                    let lyrParams = terrain.GetLayerParams(activeLayers[i]);
                    lyrParams.nDrawPriority = priority;
                    terrain.SetLayerParams(activeLayers[i],lyrParams);
                }           
            }
        }

        return terrain;
    }

    //////////////////////////////////////////////////////////////////////////////////////
    // Open a terrain in 2D or 3D mode
    //////////////////////////////////////////////////////////////////////////////////////
    const handleOpenTerrainMode = async (mode: string, terrain: MapCore.IMcMapTerrain) => {
        // Connect to mapping ROS publisher
        //rosMapping = new Mapping(serverUrl, _layerIds, asyncOpsCallback);
        //rosMapping.StartPublishMap();

        if (mode === '2D') {
            if (viewport2D == null) {
                CreateMapLayersAndViewports(terrain, mode);
            }
            else {
                const result = await ThreeD2TwoDView();
                const pos = result.position;
                const dstScale = result.mapScaleInPixelsPerMeter;
                is2DActive = true;
                is3DActive = false;
                editMode = editMode2D!;
                if (result != null) {
                    viewport2D.SetCameraOrientation(result.orientation.yaw,result.orientation.pitch,result.orientation.roll,false);
                    viewport2D.SetCameraPosition(pos);
                    viewport2D.SetCameraScale(dstScale);    
                    if (onHeadingChange) {
                        onHeadingChange(result.orientation.yaw);
                    }
                    requestAnimationFrame(doRender);
                    ToggleDayNightMode(dayMode);
                    return;
                }
            }
        }
        else if (mode === '3D') {
            if (viewport3D == null) {
                CreateMapLayersAndViewports(terrain, mode);
            }
            else {
                const result = await Prepare2To3DView(viewport2D);
                if (result != null) {
                    let pfHeight : any = {};
                    viewport3D.SetCameraOrientation(result.orientation.yaw, -90, 0);
                    viewport3D.SetCameraPosition(result.position);
                    viewport3D.SetCameraFieldOfView(result.fieldOfView);
                    if (onHeadingChange) {
                        
                        onHeadingChange(result.orientation.yaw);
                    }
                }
                is2DActive = false;
                is3DActive = true;
                editMode = editMode3D!;
                await SwitchTo3DView(viewport3D, result.position, result.orientation);
                requestAnimationFrame(doRender);
                ToggleDayNightMode(dayMode);
                return;
            }
        }

        // Start rendering
        requestAnimationFrame(doRender)

    }

    ////////////////////////////////////////////////////////////////////////////////////
    // Resize the canvas
    ///////////////////////////////////////////////////////////////////////////////////
    const resizeCanvas = (width, height) => {
        if (aViewports.length === 0) {
            return;
        }

         aViewports[0].canvas.width = width;
         aViewports[0].canvas.height = height;
        if (aViewports.length > 1)
        {
            
            aViewports[1].canvas.width = width;
            aViewports[1].canvas.height = height;    
        }

        // Resize viewports
        if (viewport2D != null) {
            viewport2D.ViewportResized();
        }
        if (viewport3D != null) {
            viewport3D.ViewportResized();
        }
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////
    // Periodically render the active viewport on the canvas
    const doRender = () => {
        let currtRenderTime: number = (new Date()).getTime();
        let isViewportRendered = false;

        // Find the active viewport
        let viewport: MapCore.IMcMapViewport = null;
        if (is2DActive) {
            viewport = viewport2D;
            isViewportRendered = rendered2D;
        }
        else if (is3DActive) {
            viewport = viewport3D;
            isViewportRendered = rendered3D;
        }

        // Debug logging
        if (!viewport) {
            console.warn('doRender: No active viewport found. is2DActive:', is2DActive, 'is3DActive:', is3DActive);
            requestAnimationFrame(doRender);
            return;
        }

        // Render it
        if (viewport != null) {
            if (viewport.HasPendingUpdates() || isViewportRendered)
            {
                viewport.Render();
            }
            else{
                viewport.PerformPendingUpdates();
                if (is2DActive) {
                    rendered2D = true;
                }
                else if (is3DActive) {
                    rendered3D = true;
                }
            }
        }


        lastRenderTime = currtRenderTime;

        // log memory usage and heap size
        if (uMemUsageLoggingFrequency !==0 && currtRenderTime >= lastMemUsageLogTime + uMemUsageLoggingFrequency * 1000) {
            console.log("Max mem = " + MapCore.IMcMapDevice.GetMaxMemoryUsage().toLocaleString() +
                ", heap = " + MapCore.IMcMapDevice.GetHeapSize().toLocaleString() + " B");
            lastMemUsageLogTime = currtRenderTime;
        }

        if (currtRenderTime >= lastLayersValidityCheckTime + 15000) // 15 seconds
        {
            MapCore.IMcMapLayer.CheckAllNativeServerLayersValidityAsync();
            lastLayersValidityCheckTime = currtRenderTime;
        }

        // ask the browser to render again
        requestAnimationFrame(doRender);
    }

    ///////////////////////////////////////////////////////////////////////////////////
    // ThreeD2TwoDView - move the camera from 3D to 2D view
    ///////////////////////////////////////////////////////////////////////////////////
    const ThreeD2TwoDView = async () : Promise<{
        mapScaleInMetersPerPixel: number,
        mapScaleInPixelsPerMeter: number,
        position: MapCore.SMcVector3D,
        orientation: {
            yaw: number,
            pitch: number,
            roll: number
            } | null
        } | null> => {

        if (is3DActive && viewport2D != null) 
        {
            // Starting the screen center find the intersection between the 2 views and the terrain
            let puWidth : any = {};
            let puHeight : any = {};

            let pos = await Get3DViewPosition(viewport3D, false);
            if (pos === MapCore.v3MinDouble) {
                console.log("Target position not found!!");
                return null;
            }

            let result = await Prepare3To2DView(viewport3D, 25, 1000);
            return result;
        }
    }



    const Get3DViewPosition = async (viewport: MapCore.IMcMapViewport, bIs2D: boolean) : Promise<MapCore.SMcVector3D> => 
    {
        // Start by finding the center point of the viewport, looking for the terrain in the center
        // of screen, if not found, move the center point down by 50 pixels and try again, until found.
        let pos : any = {};
        let uWidth : any = {};
        let uHeight : any = {};
        viewport.GetViewportSize(uWidth, uHeight);
        let midScreenPos = new MapCore.SMcVector3D(uWidth.Value / 2, uHeight.Value / 2, 0);
        let bFound = false;
        if (bIs2D) {
            viewport.GetViewportSize(uWidth, uHeight);
            bFound = viewport.ScreenToWorldOnTerrain(midScreenPos, pos);
            if (!bFound) {
                return MapCore.v3MinDouble;
            }
            let pfHeight : any = {};
        }
        else {
            while (!bFound) {
                bFound = viewport.ScreenToWorldOnTerrain(midScreenPos, pos);
                if (!bFound) {
                    midScreenPos.y += 50;
                    if (midScreenPos.y > uHeight.Value) {
                        break;
                    }
                }
                else
                {
                    let params : MapCore.IMcSpatialQueries.SQueryParams = new MapCore.IMcSpatialQueries.SQueryParams()
                    params.eTerrainPrecision = MapCore.IMcSpatialQueries.EQueryPrecision.EQP_HIGHEST;
                    let bDone = false;
                    let bFound = false;
                    // Convert enum values to bit flags and combine them
                    // TypeScript enums: ELK_DTM=0, ELK_STATIC_OBJECTS=3 (sequential)
                    const elkDTM = 0; //Number(MapCore.IMcMapLayer.ELayerKind.ELK_DTM.Value);
                    const elkStaticObjects = 3; //Number(MapCore.IMcMapLayer.ELayerKind.ELK_STATIC_OBJECTS.Value);
                    console.log("Enum values - ELK_DTM:", elkDTM, "ELK_STATIC_OBJECTS:", elkStaticObjects, 
                                "typeof:", typeof elkDTM, typeof elkStaticObjects);
                    
                    // Convert to bit flags: 1 << enumValue
                    // ELK_DTM (0) -> 1 << 0 = 1 (binary: 0001)
                    // ELK_STATIC_OBJECTS (3) -> 1 << 3 = 8 (binary: 1000)
                    const bitFlagDTM = 1 << elkDTM;
                    const bitFlagStaticObjects = 1 << elkStaticObjects;
                    console.log("Bit flags - DTM:", bitFlagDTM, "StaticObjects:", bitFlagStaticObjects);
                    
                    // Combine using bitwise OR: 1 | 8 = 9 (binary: 1001)
                    params.uItemKindsBitField = bitFlagDTM | bitFlagStaticObjects;
                    console.log("Final bit field value:", params.uItemKindsBitField, "binary:", params.uItemKindsBitField.toString(2));
                    params.pAsyncQueryCallback = new CAsyncQueryCallback(
                        (bHeightFound: any, height: any) => {
                            bFound = bHeightFound.Value;
                            if (bFound) {
                                pos.Value.z = height.Value;
                            }
                            bDone = true;
                            console.log("Found Altitude : ", pos.Value.z);
                        }
                    );
                    let height : any = {};
                    viewport.GetTerrainHeight(pos.Value, height, null, params);
                    // viewport.PerformPendingUpdates();
                    const asyncHandler = async () : Promise<void> => {
                        while (!bDone) {
                            await new Promise(resolve => setTimeout(resolve, 25));          
                        }
                    }
                    await asyncHandler();
                }
            }
            if (!bFound) {
                return MapCore.v3MinDouble;
            }
        }
        return pos.Value;
    }

    ///////////////////////////////////////////////////////////////////////////////////
    // Prepare2To3DView - Prepares a 2D viewport for a 3D view
    ///////////////////////////////////////////////////////////////////////////////////
    const Prepare2To3DView = async (
        viewport: MapCore.IMcMapViewport,
    ) : Promise<{
        fieldOfView: number,
        position: MapCore.SMcVector3D,
        orientation: {
            yaw: number,
            pitch: number,
            roll: number
        }
    } | null> => {
        let targetPosition = await Get3DViewPosition(viewport, true);
        return new Promise((resolve, reject) => 
        {           
            const mapType = viewport.GetMapType();
            const bIs2D = mapType === MapCore.IMcMapCamera.EMapType.EMT_2D;
            // Check if the viewport is 2D
            if (!bIs2D) {
                console.log("Viewport is not 2D!!");
                resolve(null);
                reject("Viewport is not 2D!!");
                return null;
            }

            // Check if the 3D viewport exists
            if (viewport3D == null) {
                console.log("Viewport3D is not created!!");
                resolve(null);
                reject("Viewport3D is not created!!");
                return null;
            }

            // Get the target position
            if (targetPosition === MapCore.v3MinDouble) 
            {
                console.log("Target position not found!!");
                resolve(null);
                reject("Target position not found!!");
                return null;
            }

            // Get the viewport size (in pixels)
            let uWidth : any = {};
            let uHeight : any = {};
            viewport.GetViewportSize(uWidth, uHeight);


            // Get the camera position and orientation
            let cameraPosition = targetPosition;
            let pfYaw : any = {};
            let pfPitch : any = {};
            let pfRoll : any = {};
            viewport.PerformPendingUpdates();
            viewport.GetCameraOrientation(pfYaw, pfPitch, pfRoll);
            let pfHeight : any = {};
            let bHeightFound = viewport3D.GetTerrainHeight(targetPosition, pfHeight);
            if (!bHeightFound) {
                pfHeight = {
                    Value: 0
                };
            }
            targetPosition.z = pfHeight.Value;

            // Calculate the distance between the target ground position and the camera position in the given scale.
            let scale = viewport.GetCameraScale();
            let alpha = lastFOV * Math.PI / 180.0;
            let distance = (scale * uWidth.Value) / (2 * Math.tan(alpha / 2));

            //using the calculated distance and the terrain height, calculate the target and the new camera position
            targetPosition.z = pfHeight.Value;
            let alt = targetPosition.z + distance;
            cameraPosition.z = alt;

            // Calculate the scale in meters per pixel
            let vWorldTopMiddle : any = {};
            let vWorldBottomMiddle : any = {};
            const vScreenTopMiddle = new MapCore.SMcVector3D(uWidth.Value / 2, 0, 0);
            const vScreenBottomMiddle = new MapCore.SMcVector3D(uWidth.Value / 2, uHeight.Value, 0);
            viewport.ScreenToWorldOnPlane(vScreenTopMiddle, vWorldTopMiddle);
            viewport.ScreenToWorldOnPlane(vScreenBottomMiddle, vWorldBottomMiddle);
            const d = vScreenBottomMiddle.y - vScreenTopMiddle.y;

            let result = {
                fieldOfView:lastFOV,
                position: cameraPosition, 
                orientation: {
                    yaw: pfYaw.Value, 
                    pitch: -90, 
                    roll: pfRoll.Value}
                };
                resolve(result);
                return result;
        });


    }

    ///////////////////////////////////////////////////////////////////////////////////
    // Prepare3To2DView - Prepares a 3D viewport for a 2D view
    ///////////////////////////////////////////////////////////////////////////////////
    const Prepare3To2DView = async (
        viewport: MapCore.IMcMapViewport,
        steps: number = 25,
        duration: number = 500
    ) : Promise<{
        mapScaleInMetersPerPixel: number,
        mapScaleInPixelsPerMeter: number,
        position: MapCore.SMcVector3D,
        orientation: {
            yaw: number,
            pitch: number,
            roll: number
        }
    } | null> => {
        let targetPosition = await Get3DViewPosition(viewport, false);
        console.log("Target position : ", targetPosition);
        return new Promise((resolve, reject) => {
            const mapType = viewport.GetMapType();
            const bIs2D = mapType === MapCore.IMcMapCamera.EMapType.EMT_2D;
            
            if (bIs2D) {
                console.log("Viewport is not 3D!!");
                resolve(null);
                reject("Viewport is not 3D!!");
                return;
            }

            if (targetPosition === MapCore.v3MinDouble) {
                console.log("Target position not found!!");
                resolve(null);
                reject("Target position not found!!");
                return;
            }
            const calc = MapCore.IMcGeographicCalculations.Create(viewport.GetCoordinateSystem());

            let pfYaw : any = {};
            let pfPitch : any = {};
            let pfRoll : any = {};
            let pfAzimuth : any = {};
            let pfDistance : any = {};

            // Get the starting position as the camera position
            let newPos = viewport.GetCameraPosition();

            // Get the camera roll
            viewport.GetCameraOrientation(pfYaw, pfPitch, pfRoll);
            let roll = pfRoll.Value;

            // Get the vector between the camera position and the target position. this vector is used
            // to calculate the pitch per each animation step.
            calc.VectorFromTwoLocations(newPos, targetPosition, pfDistance, pfAzimuth, pfPitch);

            // Get initial scale and pitch boundaries
            let scale = viewport.GetCameraScale(newPos);
            let currentPitch = pfPitch.Value;
            const toPitch = -90;

            // calculate the pitch step value - i.e. the pitch change per each animation step
            const pitchStepValue = (toPitch - pfPitch.Value) / steps;

            // Some variables to track the progress of the animation as well as the result
            let result : any = {};
            let bResultFound = false;
            let lastIndex = -1;
            let lastProgress = -1;
            lastFOV = viewport.GetCameraFieldOfView();

            // Animation callback function definition
            let startTime = new Date().getTime(); 
            const animateZoom = (currentTime : number) => {
                // Calculate the progress (step) according to the elapsed time and the duration
                let now = new Date().getTime(); 
                const elapsed = now - startTime;
                let progress = Math.min(elapsed / duration, 1);

                // If the progress is the same as the last progress, return and wait for the next frame
                if (lastProgress ===  progress) 
                {
                    requestAnimationFrame(animateZoom);
                    return;

                }
                lastProgress = progress;
                const interpolatedValue : number = currentPitch + pitchStepValue * (steps * progress);

                // Animate the pitch changes
                console.log("interpolatedPitch : ", interpolatedValue);
                if (Math.abs(interpolatedValue) >= Math.abs(toPitch)) {
                    progress = 1;
                }

                if (progress < 1) {
                    let index = Math.floor(progress * steps);
                    if (index !== lastIndex) {
                        lastIndex = index;
                        newPos = calc.LocationFromLocationAndVector(targetPosition, -pfDistance.Value, pfAzimuth.Value, interpolatedValue);

                        viewport.SetCameraPosition(newPos);
                        viewport.SetCameraLookAtPoint(targetPosition);
                        viewport.Render();
                    }
                    requestAnimationFrame(animateZoom);
                    console.log("progress : ", progress);
                }
                else {
                    // Set the camera final location and orientation
                    newPos = new MapCore.SMcVector3D(targetPosition.x, targetPosition.y, targetPosition.z + pfDistance.Value);
                    viewport.SetCameraPosition(newPos);
                    viewport.SetCameraOrientation(pfAzimuth.Value, -90, 0, false);
                    viewport.Render();

                    // Get the final scale and orientation
                    scale = viewport.GetCameraScale(targetPosition);
                    viewport.GetCameraOrientation(pfYaw, pfPitch, pfRoll);

                    // Set the result
                    result = {
                        mapScaleInMetersPerPixel: scale / viewport.GetPixelPhysicalHeight(), 
                        mapScaleInPixelsPerMeter: scale, 
                        position: newPos, 
                        orientation: {
                            yaw: pfYaw.Value, 
                            pitch:  pfPitch.Value, 
                            roll: pfRoll.Value}
                        };
                    bResultFound = true;
                    return resolve(result);
                }
            }

            // Start the animation
            requestAnimationFrame(animateZoom);

            // If the result is found, return it
            if (bResultFound) {
                calc.Destroy();
                return result;
            }
        });
    }

    ///////////////////////////////////////////////////////////////////////////////////
    // SwitchTo3DView - Activates after switching the viewport to a 3D view
    ///////////////////////////////////////////////////////////////////////////////////
    const SwitchTo3DView = async (
        viewport: MapCore.IMcMapViewport,
        position: MapCore.SMcVector3D,
        orientation: {
            yaw: number,
            pitch: number,
            roll: number
        }) => 
    {
        if (viewport.GetMapType() === MapCore.IMcMapCamera.EMapType.EMT_2D) {
            console.log("Viewport is not 3D!!");
            return;
        }

        let qParams = new MapCore.IMcSpatialQueries.SQueryParams();
        let bDone = false;
        let pfHeight : any = {};
        let bFound = false;
        let targetPosition = new MapCore.SMcVector3D(position.x, position.y, 0.0);
        qParams.eTerrainPrecision = MapCore.IMcSpatialQueries.EQueryPrecision.EQP_HIGHEST;
        qParams.uItemKindsBitField = MapCore.IMcMapLayer.ELayerKind.ELK_DTM;
        qParams.pAsyncQueryCallback = new CAsyncQueryCallback(
            (bHeightFound: any, height: any) => 
            {
                console.log(`Height found: ${bHeightFound} with height ${height}`);
                pfHeight.Value = height;
                bFound = bHeightFound;
                bDone = true;
            }
        );
        viewport.Render();
        viewport.GetTerrainHeight(targetPosition, pfHeight, null, qParams);
        while (!bDone) {
            await new Promise(resolve => setTimeout(resolve, 25));          
        }

        if (!bFound) {
            console.log("Height not found!!");
            return;
        }

        targetPosition.z = pfHeight.Value;
        let distance = position.z - pfHeight.Value; 
        let currentPitch = orientation.pitch;

        let calc = MapCore.IMcGeographicCalculations.Create(viewport.GetCoordinateSystem());
        let steps = 20;
        let duration = 500;
        let pitchStepValue = (orientation.pitch + 35) / steps;
        let startTime = new Date().getTime();
        let lastIndex = -1;
        let lastProgress = -1;

        let newPos = new MapCore.SMcVector3D(position.x, position.y, position.z);

        let animateZoom = (currentTime : number) => {

            let now = new Date().getTime(); 
            const elapsed = now - startTime;
            let progress = Math.min(elapsed / duration, 1);

            if (lastProgress ===  progress) 
            {
                requestAnimationFrame(animateZoom);
                return;
            }
            lastProgress = progress;
            const interpolatedValue : number = currentPitch - pitchStepValue * (steps * progress);

            let index = Math.floor(progress * steps);
            if (index !== lastIndex) {
                lastIndex = index;
                console.log("interpolatedValue : ", interpolatedValue);
                newPos = calc.LocationFromLocationAndVector(targetPosition, -distance, orientation.yaw, interpolatedValue);
                viewport.SetCameraPosition(newPos);
                viewport.SetCameraLookAtPoint(targetPosition);
                viewport.Render();
            }
            if (progress <= 1) {
                requestAnimationFrame(animateZoom);
            }
            else
            {
                calc.Destroy();
                return;
            }
        }
        // Start the animation
        await requestAnimationFrame(animateZoom);

    }



    ///////////////////////////////////////////////////////////////////////////////////
    // Focus the viewport on a single layer's bounding box
    ///////////////////////////////////////////////////////////////////////////////////
    const TrySetLayerBox = (layerId: string) => {
        let idx: number = terrainLayers.indexOf(layerId);

        if (idx === -1 || aViewports.length === 0) {
            return;
        }

        // Get the layer's bounding box
        let layer: MapCore.IMcMapLayer = aViewports[0].aLayers[terrainLayers.length - 1 - idx]
        let bbox: MapCore.SMcBox = layer.GetBoundingBox();
        // Per viewport
        aViewports.forEach(vpData => {
            // Get terrain center
            vpData.terrainCenter = new MapCore.SMcVector3D((bbox.MinVertex.x + bbox.MaxVertex.x) / 2,
                (bbox.MinVertex.y + bbox.MaxVertex.y) / 2, 10000);
            if (vpData.viewport.GetMapType() === MapCore.IMcMapCamera.EMapType.EMT_2D) {
                // For 2D, set the camera on the terrain center
                vpData.viewport.SetCameraPosition(vpData.terrainCenter!);
                vpData.bCameraPositionSet = true;
            }
            else {
                // In case of 3D, find the center point's altitude using a spatial query
                let height: object = {};
                vpData.terrainCenter.z = 1000;
                vpData.viewport.SetCameraPosition(vpData.terrainCenter);
                vpData.bCameraPositionSet = true;
                let params: MapCore.IMcSpatialQueries.SQueryParams = new MapCore.IMcSpatialQueries.SQueryParams();
                params.eTerrainPrecision = MapCore.IMcSpatialQueries.EQueryPrecision.EQP_HIGH;
                params.pAsyncQueryCallback = new CAsyncQueryCallback(
                    (bHeightFound: any, height: any) => {
                        vpData.terrainCenter.z = (bHeightFound ? height : 100) + 20;
                        if (vpData.viewport.GetMapType() === MapCore.IMcMapCamera.EMapType.EMT_3D) {
                            vpData.viewport.SetCameraPosition(vpData.terrainCenter);
                        }
                    }
                );
                vpData.viewport.GetTerrainHeight(vpData.terrainCenter, height, null, params); // async, wait for OnTerrainHeightResults()

            }
        });
    }

    ///////////////////////////////////////////////////////////////////////////////////
    // Init3DViewUsing2DView - Initializes a 3D view using a 2D view. This is used
    // when the user switches from 2D to 3D for the first time.
    ///////////////////////////////////////////////////////////////////////////////////
    const Init3DViewUsing2DView = async (viewportData: SViewportData, otherViewportData: SViewportData) => 
    {
        // Some variables definitions
        let fov = viewportData.viewport.GetCameraFieldOfView() * Math.PI / 180.0;
        let pWidth : any = {};
        let pHeight : any = {};
        let pYaw : any = {};
        let pos2D = otherViewportData.viewport.GetCameraPosition(); 
        let terrainHeight = -1000

        // Get the camera orientation and scale from the other viewport
        otherViewportData.viewport.GetCameraOrientation(pYaw);
        let scale = otherViewportData.viewport.GetCameraScale();
        viewportData.viewport.GetViewportSize(pWidth, pHeight);

        // Build a spatial query to find the terrain height at the 2D viewport's camera position
        let params: MapCore.IMcSpatialQueries.SQueryParams = new MapCore.IMcSpatialQueries.SQueryParams();
        params.eTerrainPrecision = MapCore.IMcSpatialQueries.EQueryPrecision.EQP_HIGH;
        let bDone = false;

        // Refresh scene
        if (!dayMode) {
            viewportData.viewport.SetBrightness(MapCore.IMcMapViewport.EImageProcessingStage.EIPS_ALL, -0.4);
        }
        viewportData.viewport.Render();

        // Set the async callback to find the terrain height
        params.pAsyncQueryCallback = new CAsyncQueryCallback(
            (bHeightFound: any, height: any) => {
                terrainHeight = (bHeightFound ? height : 0);
                bDone = true;
            }
        );

        // Get the terrain height
        viewportData.viewport.GetTerrainHeight(pos2D, terrainHeight, null, params); // async, wait for OnTerrainHeightResults()

        // Set the camera orientation and wait for the terrain height to be found
        viewportData.viewport.SetCameraOrientation(0, -89.999, 0, false);
        while (!bDone) {
            await new Promise(resolve => setTimeout(resolve, 25));          
        }

        // Calculate the distance between the camera and the terrain
        let width = pWidth.Value / 2;
        let distance = (width * scale) / (2 * Math.tan(fov / 2));
        let alt = terrainHeight + distance;

        // Set the camera position with the calculated distance and refresh the scene
        viewportData.viewport.SetCameraPosition(
            new MapCore.SMcVector3D(
                pos2D.x, 
                pos2D.y, alt));
        viewportData.viewport.Render();

        // Perform an animation describing the transition from 2D to 3D with a pitch of -45 degrees
        await SwitchTo3DView(viewportData.viewport, viewportData.viewport.GetCameraPosition(), {yaw: 0, pitch: -45, roll: 0});
        return;
    }

    const SetPositionByModeAndSight = () => {

    }


    ///////////////////////////////////////////////////////////////////////////////////
    // Focus the viewport on the terrain's bounding box
    ///////////////////////////////////////////////////////////////////////////////////

    const TrySetTerrainBox = async () => {
        // Per viewport
        for (let j: number = 0; j < aViewports.length; j++) {
            // Accumulate all layer terrain footprints
            if (aViewports[j].terrainBox == null) {
                let aViewportLayers: MapCore.IMcMapLayer[] = aViewports[j].aLayers!;

                if (aViewportLayers!.length !== 0) {
                    aViewports[j].terrainBox = new MapCore.SMcBox(
                        -MapCore.DBL_MAX, -MapCore.DBL_MAX, 0,
                        MapCore.DBL_MAX, MapCore.DBL_MAX, 0);
                    for (let i: number = 0; i < aViewportLayers.length; ++i) {

                        if (aViewports[j].bSetTerrainBoxByStaticLayerOnly)
                        {

                            const StaticCtor = (MapCore as any).IMcStaticObjectsMapLayer;
                            if (!(aViewportLayers[i] instanceof StaticCtor)) 
                            {
                              continue;
                            }
                            
                                                        // !(aViewportLayers[i] instanceof eval("MapCore.IMcStaticObjectsMapLayer"))) {
                            // continue;
                        }

                        if (!aViewportLayers[i].IsInitialized()) {
                            aViewports[j].terrainBox = null;
                            return;
                        }

                        let intersectionBox: MapCore.SMcBox = new MapCore.SMcBox();
                        MapCore.SMcBox.Intersect(intersectionBox, aViewports[j].terrainBox!, aViewportLayers[i].GetBoundingBox());
                        aViewports[j].terrainBox = intersectionBox;
                    }
                }
                else {
                    aViewports[j].terrainBox = new MapCore.SMcBox(0, 0, 0, 0, 0, 0);
                }

                if (defaultCenterPoint) {
                    aViewports[j].terrainCenter = defaultCenterPoint;
                }
                else {
                aViewports[j].terrainCenter = new MapCore.SMcVector3D((aViewports[j].terrainBox.MinVertex.x + aViewports[j].terrainBox.MaxVertex.x) / 2,
                    (aViewports[j].terrainBox.MinVertex.y + aViewports[j].terrainBox.MaxVertex.y) / 2, 0);
                }
                aViewports[j].terrainCenter.z = 10000;
            }

            // Set the terrains center
            if (!aViewports[j].bCameraPositionSet) {
                if (aViewports[j].viewport.GetMapType() === MapCore.IMcMapCamera.EMapType.EMT_2D) { // 2D
                    aViewports[j].viewport.SetCameraPosition(aViewports[j].terrainCenter);
                    aViewports[j].bCameraPositionSet = true;
                }
                else // 3D
                {
                    // In case of 3D, initialize the 3D view using the 2D view
                    // This is done only for the second viewport (the one that is not the 2D viewport)
                    let height = {};
                    let currViewportData: SViewportData = aViewports[j];

                    if (j === 1 && aViewports[0].viewport.GetMapType() === MapCore.IMcMapCamera.EMapType.EMT_2D) 
                    {
                        let otherViewportData: SViewportData = aViewports[0];
                        await Init3DViewUsing2DView(currViewportData, otherViewportData);
                        return;
                    }

                    // If the viewport is 3D and the 2D viewport does not exist, initialize the 3D poistion at the middle of the terrain
                    // Terrain center in fixed altitude or 1000m above the terrain (if tthe terrain has altitude at it's middle)
                    currViewportData.terrainCenter.z = 1000;
                    currViewportData.viewport.SetCameraPosition(aViewports[j].terrainCenter);
                    currViewportData.bCameraPositionSet = true;

                    // Query for terain height at center
                    let params: MapCore.IMcSpatialQueries.SQueryParams = new MapCore.IMcSpatialQueries.SQueryParams();
                    params.eTerrainPrecision = MapCore.IMcSpatialQueries.EQueryPrecision.EQP_HIGH;
                    params.pAsyncQueryCallback = new CAsyncQueryCallback(
                        (bHeightFound: any, height: any) => {
                            // Set height Terrain height + 250m
                            currViewportData.terrainCenter.z = (bHeightFound ? height : 100) + 250;
                            if (currViewportData.viewport.GetMapType() === MapCore.IMcMapCamera.EMapType.EMT_3D) {
                                currViewportData.viewport.SetCameraPosition(currViewportData.terrainCenter);
                            }
                        }
                    );
                    currViewportData.viewport.GetTerrainHeight(aViewports[j].terrainCenter, height, null, params); // async, wait for OnTerrainHeightResults()
                }
            }
            if (aViewports[j].viewport.GetMapType() === MapCore.IMcMapCamera.EMapType.EMT_2D) {
                if (defaultCenterPoint) {
                    aViewports[j].viewport.SetCameraScale(initial2DViewScale);
                }
            }
            aViewports[j].viewport.Render();
        }
        //resizeCanvas();
    }

    ////////////////////////////////////////////////////////////////////////////////
    // Toggle day night mode
    ////////////////////////////////////////////////////////////////////////////////
    const ToggleDayNightMode = (bDayMode: boolean) => {
        let value = bDayMode ? 0.0 : -0.4;
        dayMode = bDayMode;
        if (viewport2D !== null) {
            viewport2D.SetBrightness(MapCore.IMcMapViewport.EImageProcessingStage.EIPS_ALL, value);
        }
        if (viewport3D !== null) {
            viewport3D.SetBrightness(MapCore.IMcMapViewport.EImageProcessingStage.EIPS_ALL, value);
        }
    }

    ////////////////////////////////////////////////////////////////////////////////
    // Perfrom operation after edit object
    ////////////////////////////////////////////////////////////////////////////////
    const OnEditResult = (obj : MapCore.IMcObject) => 
    {
    }

    const OnWebServerLayersResults = (   
        eStatus: MapCore.IMcErrors.ECode, 
        strServerURL: string, 
        eWebMapServiceType: MapCore.IMcMapLayer.EWebMapServiceType, 
        aLayers: MapCore.IMcMapLayer.SServerLayerInfo[], 
        astrServiceMetadataURLs: string,
        strServiceProviderName: string) => {

            let theLayers : MapCore.IMcMapLayer.SServerLayerInfo[] = [];
            if (eStatus === MapCore.IMcErrors.ECode.SUCCESS)
            {
                aLayers.forEach((aLayer) => {
                    if (aLayer.pCoordinateSystem)
                    {
                        aLayer.pCoordinateSystem.AddRef();
                    }
                    else
                    {
                        console.log(`Could not retrieve CRS from Layer ${aLayer.strLayerId} using default (32636)`);
                        aLayer.pCoordinateSystem = MapCore.IMcGridGeneric.Create("epsg:32636") as MapCore.IMcGridCoordinateSystem;
                        aLayer.pCoordinateSystem.AddRef();
                    }
                    theLayers.push(aLayer);                                        
                });
                setMapServer(theLayers);
            }
        }

    ////////////////////////////////////////////////////////////////////////////////
    // Initialize callback 
    ////////////////////////////////////////////////////////////////////////////////
    const initCallbacks = () => {
        layerCallback =CreateCallbackClasses(TrySetTerrainBox, OnEditResult, OnWebServerLayersResults);
        asyncOpsCallback = new CAsyncOperationCallback();
    }


    /////////////////////////////////////////////////////////////////////////////////
    // Gather server information results
    /////////////////////////////////////////////////////////////////////////////////
    const GatherServerInformation = () => {
        if (MapCore.IMcMapDevice.PerformPendingCalculations())
        {
            requestAnimationFrame(GatherServerInformation);
        }
        else
        {
            console.log("Server information gathering was completed.");
            setIsMapCoreInitialized(true);
        }
    }


    /////////////////////////////////////////////////////////////////////////////////
    // Init mapcore's device
    /////////////////////////////////////////////////////////////////////////////////
    const initDevice = () => {
        let init: MapCore.IMcMapDevice.SInitParams = new MapCore.IMcMapDevice.SInitParams();
        init.uNumTerrainTileRenderTargets = 100;
        init.eViewportAntiAliasingLevel = MapCore.IMcMapDevice.EAntiAliasingLevel.EAAL_4;
        init.eTerrainObjectsAntiAliasingLevel = MapCore.IMcMapDevice.EAntiAliasingLevel.EAAL_4;
        (MapCore as any).__UseCesiumNative = false;
        _device = MapCore.IMcMapDevice.Create(init);
        _device.AddRef();

        (MapCore as any).__MaxAllowedGeometricError = 75.0;
        (MapCore as any).__GeoErrorScaleFactor = 0.05;

        initCallbacks();


        if (!isExternalGroup()) 
        {
            MapCore.IMcMapDevice.GetWebServerLayers(
                GetCapabilitiesUrl(),
                MapCore.IMcMapLayer.EWebMapServiceType.EWMS_MAPCORE,
                [],
                asyncOpsCallback);
        }
        else
        {
            onExternalSourceReady?.();
        }

        requestAnimationFrame(GatherServerInformation);           
    }

    /////////////////////////////////////////////////////////////////////////////////
    // Toggle the geographical grid display
    /////////////////////////////////////////////////////////////////////////////////
    const toggleGrid = () => {
        if (!is2DActive) {
            // grid is not supported in 3D
            return;
        }

        let viewport: MapCore.IMcMapViewport = viewport2D;

        if (!viewport!.GetGridVisibility() || viewport!.GetGrid() == null) {
            if (viewport!.GetGrid() == null) {
                // Create grid region
                let gridRegion: MapCore.IMcMapGrid.SGridRegion = new MapCore.IMcMapGrid.SGridRegion();

                gridRegion.pGridLine = MapCore.IMcLineItem.Create((MapCore.IMcObjectSchemeItem.EItemSubTypeFlags.EISTF_SCREEN as any).value, MapCore.IMcLineBasedItem.ELineStyle.ELS_SOLID, MapCore.bcBlackOpaque, 2);

                gridRegion.pGridText = MapCore.IMcTextItem.Create((MapCore.IMcObjectSchemeItem.EItemSubTypeFlags.EISTF_SCREEN as any).value, MapCore.EMcPointCoordSystem.EPCS_SCREEN, null!, new MapCore.SMcFVector2D(12, 12));
                gridRegion.pGridText.SetTextColor(new MapCore.SMcBColor(255, 0, 0, 255));

                gridRegion.pCoordinateSystem = viewport!.GetCoordinateSystem();
                gridRegion.GeoLimit.MinVertex = new MapCore.SMcVector3D(0, 0, 0);
                gridRegion.GeoLimit.MaxVertex = new MapCore.SMcVector3D(0, 0, 0);

                let basicStep: number = 2000.0;
                let currentStep: number = basicStep;

                let scaleStep = [];
                scaleStep[0] = new MapCore.IMcMapGrid.SScaleStep();

                scaleStep[0].fMaxScale = 80;
                scaleStep[0].eAngleValuesFormat = MapCore.IMcMapGrid.EAngleFormat.EAF_DECIMAL_DEG;
                scaleStep[0].NextLineGap = new MapCore.SMcVector2D(currentStep, currentStep);
                scaleStep[0].uNumOfLinesBetweenDifferentTextX = 2;
                scaleStep[0].uNumOfLinesBetweenDifferentTextY = 2;
                scaleStep[0].uNumOfLinesBetweenSameTextX = 2;
                scaleStep[0].uNumOfLinesBetweenSameTextY = 2;
                scaleStep[0].uNumMetricDigitsToTruncate = 3;

                currentStep *= 2;

                scaleStep[1] = new MapCore.IMcMapGrid.SScaleStep();
                scaleStep[1].fMaxScale = 160;
                scaleStep[1].eAngleValuesFormat = MapCore.IMcMapGrid.EAngleFormat.EAF_DECIMAL_DEG;
                scaleStep[1].NextLineGap = new MapCore.SMcVector2D(currentStep, currentStep);
                scaleStep[1].uNumOfLinesBetweenDifferentTextX = 2;
                scaleStep[1].uNumOfLinesBetweenDifferentTextY = 2;
                scaleStep[1].uNumOfLinesBetweenSameTextX = 2;
                scaleStep[1].uNumOfLinesBetweenSameTextY = 2;
                scaleStep[1].uNumMetricDigitsToTruncate = 3;

                currentStep *= 2;

                scaleStep[2] = new MapCore.IMcMapGrid.SScaleStep();
                scaleStep[2].fMaxScale = 320;
                scaleStep[2].eAngleValuesFormat = MapCore.IMcMapGrid.EAngleFormat.EAF_DECIMAL_DEG;
                scaleStep[2].NextLineGap = new MapCore.SMcVector2D(currentStep, currentStep);
                scaleStep[2].uNumOfLinesBetweenDifferentTextX = 2;
                scaleStep[2].uNumOfLinesBetweenDifferentTextY = 2;
                scaleStep[2].uNumOfLinesBetweenSameTextX = 2;
                scaleStep[2].uNumOfLinesBetweenSameTextY = 2;
                scaleStep[2].uNumMetricDigitsToTruncate = 3;

                currentStep *= 2;

                scaleStep[3] = new MapCore.IMcMapGrid.SScaleStep();
                scaleStep[3].fMaxScale = 640;
                scaleStep[3].eAngleValuesFormat = MapCore.IMcMapGrid.EAngleFormat.EAF_DECIMAL_DEG;
                scaleStep[3].NextLineGap = new MapCore.SMcVector2D(currentStep, currentStep);
                scaleStep[3].uNumOfLinesBetweenDifferentTextX = 2;
                scaleStep[3].uNumOfLinesBetweenDifferentTextY = 2;
                scaleStep[3].uNumOfLinesBetweenSameTextX = 2;
                scaleStep[3].uNumOfLinesBetweenSameTextY = 2;
                scaleStep[3].uNumMetricDigitsToTruncate = 3;

                currentStep *= 2;

                scaleStep[4] = new MapCore.IMcMapGrid.SScaleStep();
                scaleStep[4].fMaxScale = 1280;
                scaleStep[4].eAngleValuesFormat = MapCore.IMcMapGrid.EAngleFormat.EAF_DECIMAL_DEG;
                scaleStep[4].NextLineGap = new MapCore.SMcVector2D(currentStep, currentStep);
                scaleStep[4].uNumOfLinesBetweenDifferentTextX = 2;
                scaleStep[4].uNumOfLinesBetweenDifferentTextY = 2;
                scaleStep[4].uNumOfLinesBetweenSameTextX = 2;
                scaleStep[4].uNumOfLinesBetweenSameTextY = 2;
                scaleStep[4].uNumMetricDigitsToTruncate = 3;

                currentStep *= 2;

                scaleStep[5] = new MapCore.IMcMapGrid.SScaleStep();
                scaleStep[5].fMaxScale = 2560;
                scaleStep[5].eAngleValuesFormat = MapCore.IMcMapGrid.EAngleFormat.EAF_DECIMAL_DEG;
                scaleStep[5].NextLineGap = new MapCore.SMcVector2D(currentStep, currentStep);
                scaleStep[5].uNumOfLinesBetweenDifferentTextX = 2;
                scaleStep[5].uNumOfLinesBetweenDifferentTextY = 2;
                scaleStep[5].uNumOfLinesBetweenSameTextX = 2;
                scaleStep[5].uNumOfLinesBetweenSameTextY = 2;
                scaleStep[5].uNumMetricDigitsToTruncate = 3;

                currentStep *= 2;

                scaleStep[6] = new MapCore.IMcMapGrid.SScaleStep();
                scaleStep[6].fMaxScale = MapCore.FLT_MAX;
                scaleStep[6].eAngleValuesFormat = MapCore.IMcMapGrid.EAngleFormat.EAF_DECIMAL_DEG;
                scaleStep[6].NextLineGap = new MapCore.SMcVector2D(currentStep, currentStep);
                scaleStep[6].uNumOfLinesBetweenDifferentTextX = 2;
                scaleStep[6].uNumOfLinesBetweenDifferentTextY = 2;
                scaleStep[6].uNumOfLinesBetweenSameTextX = 2;
                scaleStep[6].uNumOfLinesBetweenSameTextY = 2;
                scaleStep[6].uNumMetricDigitsToTruncate = 3;

                let grid: MapCore.IMcMapGrid = MapCore.IMcMapGrid.Create([gridRegion], scaleStep);
                viewport.SetGrid(grid);
            }
            viewport.SetGridVisibility(true);
        }
        else {
            viewport.SetGridVisibility(false);
        }
    }

    ///////////////////////////////////////////////////////////////////////////////
    // Creates (or toggle) rectangle footprints surrounding all visible maps
    ///////////////////////////////////////////////////////////////////////////////
    const DoCreateOrToggleMapFootrpints = () => {
        if (aFtObjects.length === 0) {
            if (mapFootprintScheme == null) {
                let uri: string = 'ObjectWorld/Schemes/MapFootprint.m';
                fetch(uri).then((response: any) => (
                    response.ok ? response.arrayBuffer() : null
                )).then((arrayBuffer: ArrayBuffer) => {
                    let buf: Uint8Array = new Uint8Array(arrayBuffer!);
                    mapFootprintScheme = overlayManager!.LoadObjectSchemes(buf)[0];
                    ToggleFootprints();
                }).catch((error) => { alert(error) });
            }
        }
        else {
            ToggleFootprints();
        }
    }

    //////////////////////////////////////////////////////////////////////////////////
    // Toggle the visible maps footprints
    //////////////////////////////////////////////////////////////////////////////////
    const ToggleFootprints = () => {
        let aCollections: MapCore.IMcCollection[] = overlayManager!.GetCollections();
        if (aFtObjects.length > 0) {
            if (aCollections[0].GetCollectionVisibility(null!)) {
                aCollections[0].SetCollectionVisibility(false);
            }
            else {
                aCollections[0].SetCollectionVisibility(true);
            }
        }
        else if (aViewports[0].aViewportTerrains[0].GetLayers().length > 0) {
            let layers = aViewports[0].aViewportTerrains[0].GetLayers();
            layers.forEach((layer: MapCore.IMcMapLayer) => {
                let bbox:MapCore.SMcBox = layer.GetBoundingBox();
                let footprint: MapCore.IMcObject = MapCore.IMcObject.Create(overlay!, mapFootprintScheme, [bbox.MinVertex, bbox.MaxVertex]);
                aFtObjects.push(footprint);
            });
            let objs: MapCore.IMcCollection = MapCore.IMcCollection.Create(overlayManager!);
            objs.AddOverlays(overlayManager!.GetOverlays());
            objs.AddObjects(aFtObjects);
            objs.SetCollectionVisibility(true);
        }
    };

    /////////////////////////////////////////////////////////////////////////
    // Generate initial guess
    /////////////////////////////////////////////////////////////////////////
    const DoSetInitialGuess = (obj_id: number) => {
        if (overlay)
        {
            try {
                let obj = overlay.GetObjectByID(obj_id);
                GenerateInitialGuessObj(obj, obj_id);
            } catch (error) {
                initialGuessScheme = null;
                let uri: string = 'ObjectWorld/Schemes/InitialGuess.m';

                fetch(uri).then((response) => (
                    response.ok ? response.arrayBuffer() : null
                )).then((arrayBuffer) => {
                    // Load the file contents into a scheme and start edit it
                    if (arrayBuffer != null) {
                        let buf: Uint8Array = new Uint8Array(arrayBuffer);
                        let schemes = overlayManager!.LoadObjectSchemes(buf);
                        initialGuessScheme = schemes[0];
                        if (is2DActive)
                        {
                            GenerateInitialGuessObj(null, obj_id);
                        }
                    }
                    else {
                        alert(`Fetch error - (${uri})`)
                    }
                }).catch((error) => { alert(error) });
            }
        }
    }    

    const GenerateInitialGuessObj = (currObj : MapCore.IMcObject, obj_id: number) => {
        let pos = viewport2D.GetCameraPosition() as MapCore.SMcVector3D;
        let obj : MapCore.IMcObject = null;

        if (currObj === null) // create new
        {
            obj = MapCore.IMcObject.Create(
                overlay, initialGuessScheme, [pos] );
        }
        else // create new and remove previous
        {
            obj = MapCore.IMcObject.Create(
                overlay, initialGuessScheme, [pos] );
            currObj.Remove();
            currObj = null;
        }
        obj.SetID(obj_id);
        // obj.SetID(OBJ_INITIAL_GUESS_ID);
        if (obj_id === 5)
        {
            obj.SetFloatProperty(2, 200); // x.
            obj.SetFloatProperty(3, 200); // y
        }
        if (obj_id === 7)
        {
            obj.SetFloatProperty(2, 5); // x.
            obj.SetFloatProperty(3, 5); // y
        }

        initialGuessScheme.GetNodes().forEach(node => {
            if (node.GetNodeKind() === MapCore.IMcObjectSchemeNode.ENodeKindFlags.ENKF_SYMBOLIC_ITEM)
            {
                let item = node as MapCore.IMcObjectSchemeItem;
                if (item.GetChildren().length > 0)
                {
                    editMode2D.StartEditObject(obj, item); // make the object visuality
                }
            }
        });
    }

    /////////////////////////////////////////////////////////////////////////
    // Start simulation
    /////////////////////////////////////////////////////////////////////////
    const DoStartSim = () => {
        let simTrackObj = null;
        let simTrailObj = null;
        let navfixObj   = null;
        let bGenerateObj = false;

        if (overlay)
        {
            if (simTrackScheme == null)
            {
                let uri: string = `ObjectWorld/Schemes/simdata.m`;
                fetch(uri).then((response) => (
                    response.ok ? response.arrayBuffer() : null
                )).then((arrayBuffer) => {
                    // Load the file contents into a scheme and start edit it
                    if (arrayBuffer != null) {
                        let buf: Uint8Array = new Uint8Array(arrayBuffer);
                        let schemes = overlayManager!.LoadObjectSchemes(buf);
                        simTrackScheme = schemes[1];
                        try {
                            simTrackObj = overlay.GetObjectByID(OBJ_SIMTRACK_ID);
                        }
                        catch(ex)
                        {
                            simTrackObj = MapCore.IMcObject.Create(overlay, simTrackScheme);
                            simTrackObj.SetID(OBJ_SIMTRACK_ID);        
                        }
                    }
                    else {
                        alert(`Fetch error - (${uri})`)
                    }
                }).catch((error) => { alert(error) });
                return;
            }

            if (navfixScheme == null)
            {
                // navfix scheme - as well
                let uri2: string = 'ObjectWorld/Schemes/gpsmarker.m';
                fetch(uri2).then((response) => (
                    response.ok ? response.arrayBuffer() : null
                )).then((arrayBuffer) => {
                    if (arrayBuffer != null) {
                        let buf: Uint8Array = new Uint8Array(arrayBuffer);
                        let schemes = overlayManager!.LoadObjectSchemes(buf);
                        navfixScheme = schemes[0];

                        try {
                            navfixObj = overlay.GetObjectByID(OBJ_NAVFIX_ID);
                        }
                        catch (ex)
                        {
                            navfixObj = MapCore.IMcObject.Create(overlay, navfixScheme);
                            navfixObj.SetID(OBJ_NAVFIX_ID);        
                        }
                    }
                    else {
                        alert(`Fetch error - (${uri2})`)
                    }
                }).catch((error) => alert(error));
                return;
            }

            try {
                if (!!!simTrackObj) simTrackObj = overlay.GetObjectByID(OBJ_SIMTRACK_ID);
                if (!!!navfixObj) navfixObj = overlay.GetObjectByID(OBJ_NAVFIX_ID);
            }
            catch (ex)
            {
                if (ex instanceof MapCore.CMcError)
                {
                    bGenerateObj = true;
                }
                else throw ex;
            }
        }
        else
        {
            return;
        }

        // if (bGenerateObj)
        // {
        //     // Try to read the simulation track object
        //     try 
        //     {
        //         simTrackObj = MapCore.IMcObject.Create(overlay, simTrackScheme);
        //         simTrackObj.SetID(OBJ_SIMTRACK_ID);

        //         navfixObj = MapCore.IMcObject.Create(overlay, navfixScheme);
        //         navfixObj.SetID(OBJ_NAVFIX_ID);
        //     }
        //     catch(ex)
        //     {
        //         if (!(ex instanceof MapCoreError) ) throw ex;
        //     }
        // }

        // if (vehicle != null && vehicle.isActive)
        // {
        //     vehicle.Unsubscribe();
        //     // if (bGenerateObj)
        //     // {
        //         vehicle = new Vehicle(simTrailObj, navfixObj);
        //     // }
        // }
        // else if (vehicle == null)
        // {
        //     vehicle = new Vehicle(simTrailObj, navfixObj);
        // }

        // // Sim track
        // vehicle.Subscribe(simTrackObj);        
    // };

    // const handleGPS = () => {
    //     try{
    //         if (vehicle.navsatFixObject){
    //         vehicle.handleGPS(!gpsMode);
    //         }
    //         setGpsMode(!gpsMode);
    //     }
    //     catch{
    //         alert("choose a map")
    //     }
        
        
        
    };

    /////////////////////////////////////////////////////////////////////////
    // End simulation
    /////////////////////////////////////////////////////////////////////////
    // const DoEndSim = () => {
    //     if (vehicle)
    //     {
    //         if (vehicle.isActive)
    //         {
    //             vehicle.Unsubscribe();
    //             setRobotSpeed(0);
    //         }
    //     }
    // }

    // const ToggleNavigation = () => {
    //     if (navcoreObjects.IsConnected && !!overlay)
    //     {
    //         let robotTrailObj = null;
    //         // Try loading an existing trail object 
    //         try {
    //             robotTrailObj = overlay.GetObjectByID(OBJ_SIMTRAIL_ID);
    //         }
    //         catch (ex) {
    //             if (ex instanceof MapCore.CMcError)
    //             {
    //                 alert ("Path does not exists...");
    //             }
    //             else { throw ex; }
    //         }

    //         let bOk = navcoreObjects.ToggleNavigation(robotTrailObj);
    //     }
    // }
    /////////////////////////////////////////////////////////////////////////
    // Send Navigation Description request to ROSCORE
    /////////////////////////////////////////////////////////////////////////
    // const DoPublishPathDescription = () => {
    //     if (navcoreObjects.IsConnected)
    //     {
    //         navcoreObjects.RequestForPathDesc();
    //     }
    //     else
    //     {
    //         alert("Service is not connected")
    //     }
    // }

    /////////////////////////////////////////////////////////////////////////
    // Send the rpbpt trail to ROSCORE
    /////////////////////////////////////////////////////////////////////////
    // const DoPublishRobotTrail= (layerId : string, frame : string) => {
    //     if (navPathXmit.IsConnected)
    //     {
    //         let robotTrailObj = null;
    //         if (overlay)
    //         {
    //             // Try loading an existing trail object 
    //             try {
    //                 robotTrailObj = overlay.GetObjectByID(OBJ_SIMTRAIL_ID);
    //             }
    //             catch (ex) {
    //                 if (ex instanceof MapCore.CMcError)
    //                 {
    //                     alert ("Path does not exists...");
    //                 }
    //                 else { throw ex; }
    //             }

    //             // Call the service
    //             let bOk = navPathXmit.TransmitNavPath(layerId, frame, robotTrailObj);
    //             if  (!bOk)
    //             {
    //                 alert("Problem with the server. Check if ROSCORE is up...");
    //             }
    //             else
    //             {
    //                 setWpCtxEnabled(true);
    //                 //wpContextMenuEnabled = true;
    //             }
    //         }
    //     }
    //     else
    //     {            
    //         alert("RosBRIDE is disconnected");
    //     }
    // };

    /////////////////////////////////////////////////////////////////////////
    // Remove waypoints
    /////////////////////////////////////////////////////////////////////////
    // const DoRemoveWaypoints = () => {
    //     if (navcoreObjects.IsConnected)
    //     {
    //         navcoreObjects.RemoveWaypoints();
    //     }
    // }

    /////////////////////////////////////////////////////////////////////////
    // Edit robot trail edit
    /////////////////////////////////////////////////////////////////////////
    // const DoRobotTrailObject = (infrastructureOnly : boolean = false) => {
    //     let robotTrailObj = null;

    //     if (overlay)
    //     {
    //         // Try loading an existing trail object if it exists
    //         try {
    //             robotTrailObj = overlay.GetObjectByID(OBJ_SIMTRAIL_ID);
    //         }
    //         catch (ex) {
    //             if (ex instanceof MapCore.CMcError)
    //             {
    //                 robotTrailObj = null;
    //             }
    //             else { throw ex; }
    //         }

    //         // If such a trail exists - remove it
    //         if (robotTrailObj != null)
    //         {
    //             if (navcoreObjects.IsConnected && (!!navcoreObjects.PathObject))
    //             {
    //                 navcoreObjects.Destroy(true);
    //                 if (robotTrailObj != null)
    //                 {
    //                     robotTrailObj.Remove();
    //                     robotTrailObj = null;
    //                 }
    //             }
    //             else
    //             {
    //                 robotTrailObj.Remove();
    //             }
    //             navcoreObjects.RemoveWaypoints();
    //             robotTrailObj = null;
    //             robotTrailScheme = null;
    //         }

    //         // Check if the scheme was not previously loaded
    //         if (robotTrailScheme == null)
    //         {
    //             // Fetch the scheme file from the web
    //             let uri: string = `ObjectWorld/Schemes/simdata.m`;
    //             fetch(uri).then((response) => (
    //                 response.ok ? response.arrayBuffer() : null
    //             )).then((arrayBuffer) => {
    //                 // Load the file contents into a scheme and start edit it
    //                 if (arrayBuffer != null) {
    //                     let buf: Uint8Array = new Uint8Array(arrayBuffer);
    //                     let schemes = overlayManager!.LoadObjectSchemes(buf);
    //                     robotTrailScheme = schemes[0];
    //                     simTrackScheme = schemes[1];
    //                     DoStartInitObject(robotTrailScheme, OBJ_SIMTRAIL_ID);
    //                 }
    //                 else {
    //                     alert(`Fetch error - (${uri})`)
    //                 }
    //             }).catch((error) => { alert(error) });
    //         }
    //         else 
    //         {
    //             // Start edit the object using the preloaded scheme
    //             if (!infrastructureOnly)
    //             {
    //                 DoStartInitObject(robotTrailScheme, OBJ_SIMTRAIL_ID);
    //             }
    //         }
    //     }
    // }

    /////////////////////////////////////////////////////////////////////////
    // Edit terrain analysis (Ellipse) using GPU 
    /////////////////////////////////////////////////////////////////////////

    const DoEllipseGPU = () => {
        let ellipseObj = null;


        if (overlay) {
            // Check if the object is allready exists
            try {
                ellipseObj = overlay.GetObjectByID(OBJ_ELLIPSE_ID);
            }
            catch (ex) {
                if (ex instanceof MapCore.CMcError) {
                    ellipseObj = null;
                }
                else {
                    throw ex;
                }
            }
        }
        // If so, remove it.
        if (!!ellipseObj) {
            ellipseObj.Remove();
            ellipseSchemesGPU = null;
            return;
        }
        // Check if the scheme had not been loaded before
        else if (ellipseSchemesGPU == null) {
            // Fetch the scheme file from the web
            let uri: string = `ObjectWorld/Schemes/EllipseScheme.m`;
            fetch(uri).then((response) => (
                response.ok ? response.arrayBuffer() : null
            )).then((arrayBuffer) => {
                // Load the file butes into a scheme and start edit it
                if (arrayBuffer != null) {
                    let buf: Uint8Array = new Uint8Array(arrayBuffer);
                    ellipseSchemesGPU = overlayManager!.LoadObjectSchemes(buf)[0];
                    DoStartInitObject(ellipseSchemesGPU, OBJ_ELLIPSE_ID);
                }
                else {
                    alert(`Fetch error - (${uri})`)
                }
            }).catch((error) => { alert(error) });
        }
        else {
            // Start edit the object using the preloaded scheme
            DoStartInitObject(ellipseSchemesGPU, OBJ_ELLIPSE_ID);
        }
    }

    /////////////////////////////////////////////////////////////////////////////
    // Start edit an object using an exising scheme
    /////////////////////////////////////////////////////////////////////////////
    const DoStartInitObject = (pScheme: MapCore.IMcObjectScheme, objId: number) => {
        if (pScheme != null) {
            // Select the propper edit mode
            is2DActive ? editMode = editMode2D : editMode = editMode3D

            // find item marked for editing (e.g. by setting ID = 1000)
            let pItem: MapCore.IMcObjectSchemeItem = pScheme.GetNodeByID(1000) as MapCore.IMcObjectSchemeItem;

            if (pItem == null) {
                alert("There is no item marked for editing (with ID = 1000)");
                return;
            }

            // create object
            let pObject: MapCore.IMcObject = MapCore.IMcObject.Create(overlay!, pScheme);
            pObject.SetID(objId);

            // start EditMode action
            editMode!.StartInitObject(pObject, pItem);
        }
    }

    //////////////////////////////////////////////////////////////
    // Remove all objects from the overlay
    //////////////////////////////////////////////////////////////
    const closeObjects = () => {
        let overlays: MapCore.IMcOverlay[] = overlayManager != null ? overlayManager.GetOverlays() : null;
        if (overlays == null) return;

        let overlay: MapCore.IMcOverlay = overlays[0];
        let collection: MapCore.IMcCollection = overlayManager!.GetCollections().length > 0 ? overlayManager!.GetCollections()[0] : null;

        // if (vehicle)
        // {
        //     if (vehicle.isActive)
        //     {
        //         vehicle.Unsubscribe();
        //     }
        // }
        // vehicle = null;

        // if (navcoreObjects != null)
        // {
        //     navcoreObjects.Destroy();
        // }

        if (collection != null) {
            collection.Remove();
        }

        aObjects.forEach((item) => {
            item.object.Remove();
        });

        aFtObjects.forEach((item) => {
            item.Remove();
        })



        while (overlay.GetObjects().length > 0) {
            overlay.GetObjects()[0].Remove();
        }

        aObjects = [];
        aFtObjects = [];

        ellipseSchemesGPU = null;
        testObjectsScheme = null;
        mapFootprintScheme = null;
        robotTrailScheme = null;
        simTrackScheme = null;
        initialGuessScheme = null;
        // navcoreObjects = null;

    }


    ///////////////////////////////////////////////////////////////
    // Close currently display maps
    ///////////////////////////////////////////////////////////////

    const doCloseMap = () => {
        // Do not continue if no viewport exists
        let terrain = null;
        if (viewport2D == null && viewport3D == null) {
            return;
        }

        // Remove all objects
        closeObjects();

        // Get the currently displayed terrainF
        terrain = aViewports.length > 0 ? aViewports[0].viewport.GetTerrains()[0] : null;

        // Shut down all edit modes and viewports
        while (aViewports.length > 0) {
            aViewports[0].editMode.Destroy();
            aViewports[0].viewport.Release();
            aViewports = aViewports.filter((value: SViewportData, index: number, array: SViewportData[]) => index !== 0);
        }

        // Remove the terrain
        if (terrain != null) {
            terrain.Release();
        }

        // Clean overlay and all it's subordinates
        if (overlay != null) {
            // Clear overlays
            overlay.Remove();
            overlay = null;
        }

        // Clean the overlay manager
        if (overlayManager != null) {
            overlayManager.Release();
            overlayManager = null;
        }

        // Remove canvas mouse handlers
        let currCanvas: HTMLCanvasElement = document.getElementById('InternalCanvas') as HTMLCanvasElement;
        let currParent: HTMLElement = document.getElementById('Canvases');
        currCanvas?.removeEventListener("wheel", handleMouseWheel, false);
        currCanvas?.removeEventListener("pointermove", handlePointerMove, false);
        currCanvas?.removeEventListener("pointerdown", handlePointerDown, false);
        currCanvas?.removeEventListener("pointerup", handlePointerUp, false);
        currCanvas?.addEventListener("dblclick", HandleDblClick, false);

        // Remove the canvas element
        currParent?.removeChild(currCanvas!);

        // Clean all global variables.
        editMode2D = null;
        viewport2D = null;
        editMode3D = null;
        viewport3D = null;
        is2DActive = false;
        is3DActive = false;
        ellipseSchemesGPU = null;
        robotTrailScheme = null;
        simTrackScheme = null;
        // navcoreObjects = null;            

        // remove viewport data array
        aViewports = [];
        cursorPos(null);
    }


    const OnCloseMapSetSelection = (_layerIds : string[], removeAll : boolean) => {
        mapSelectOpened = false; 
        // setIsMapSetSelectOpen(false);
    }

    const handleOptionSelect = (option : string) => {
        // setSelectedItem(option);
        lastSelectedItem = option;
    }

    const handleContextMenu = (x: number, y: number, isEdit=true) =>
    {
        if (aViewports.length > 0)
        {
            let parms = new MapCore.IMcSpatialQueries.SQueryParams();
            parms.eTerrainPrecision = MapCore.IMcSpatialQueries.EQueryPrecision.EQP_DEFAULT;
            parms.uItemKindsBitField = MapCore.IMcObjectSchemeNode.ENodeKindFlags.ENKF_SYMBOLIC_ITEM;
            parms.uItemTypeFlagsBitField = 
                MapCore.IMcArrowItem.NODE_TYPE | MapCore.IMcLineItem.NODE_TYPE;
            const cs = MapCore.EMcPointCoordSystem.EPCS_SCREEN;
            const mousePos : MapCore.SMcVector3D = {x: x, y: y ,z: 0}
            let geometry = new MapCore.SMcScanPointGeometry(cs, mousePos, 10);
            let viewport = is2DActive ? aViewports[0].viewport : aViewports[aViewports.length-1].viewport;
            let aTargets = viewport.ScanInGeometry(geometry, false, parms);
            if (aTargets.length > 0)
            {
                console.log("Clicked on an object...");
                if (onSelectedObject != null)
                {
                    onSelectedObject(aTargets[0].ObjectItemData.pObject, isEdit);
                }
            }
            
            //aViewports[0].viewport.ScanInGeometry();
        }
    }

    const handleCloseAction = () => {
        isCameraTrack = false;
        FirstCameraTrack = true;
        doCloseMap();
        terrainLayers = [];
        setMapDisplayed(false);
    }

    //-------------------------------------------------------------------------
    // The following block is called every time the action property changes
    // causes the viewer to analyze abd handle it
    //
    const compareAction =  (): boolean => {
        if (JSON.stringify(lastAction) !== JSON.stringify(action)) {
            // Only if a valid action and device
            if (action!.action !== undefined && _device !== undefined) {
                // Make sure that mapcore is initialized
            // Handle open terrain
                if (action.action === 'OPEN_TERRAIN') {
                    if (action.remoteEpsg != null && action.remoteEpsg != undefined)
                    {
                        externalCrsEpsg = action.remoteEpsg;
                        console.log(`External CRS EPSG: ${externalCrsEpsg}`);
                    }
                    // Try to setup the terrain first
                    terrainLayers = action.layerIds;
                    let grid = getTerrainCrs();
                    if (grid == null)
                    {
                        console.log('Could not find CRS in all layers.')                        
                        return false;
                    }
                    // let grid = null;
                    let terrain = null;
                    if (grid === undefined) {
                        alert('The terrain contains more then one CRS');
                        return false;
                    }

                    if (aViewports.length > 0) {
                        terrain = aViewports[0].viewport.GetTerrains()[0];
                    }
                    else {
                        if (action.remoteUrl && action.remoteToken && action.remoteType && action.remoteBaseUrl) 
                        {
                            terrain = createTerrain(grid, action.layerIds, action.remoteUrl, action.remoteToken, 
                                action.remoteBaseUrl, action.remoteWmtsLayersList, action.remoteWmtsTilingScheme,   
                                action.remoteType);
                        }
                        else 
                        {
                            terrain = createTerrain(grid, action.layerIds);
                        }
                    }
                    handleOpenTerrainMode(action.mode, terrain);
                }
                else if (action.action === 'ADD_LAYER') {
                    if (aViewports.length > 0)
                    {
                        let arrLayerId = [action.layerId];
                        let actualTerrain : MapCore.IMcMapTerrain = aViewports[0].aViewportTerrains[0];
                        let crs = actualTerrain.GetCoordinateSystem();
                        let terrain = createTerrain(
                            crs, 
                            arrLayerId);
                        let pLayer = terrain.GetLayers()[0];
                        actualTerrain.AddLayer(pLayer);
                        terrainLayers.push(action.layerId);
                        aViewports[0].aLayers.push(pLayer);
                        terrain.Release();
                    }
                }
                else if (action.action === 'REMOVE_LAYER') {
                    if (aViewports.length > 0)
                    {
                        let idx: number = terrainLayers.indexOf(action.layerId);

                        if (idx === -1 || aViewports.length === 0) {
                            return;
                        }

                        const vp = aViewports[0];
                        const actualTerrain = vp.aViewportTerrains?.[0];
                        // Get the layer
                        const pLayer = vp.aLayers[idx];
                    
                        if (terrainLayers.length == 1)
                        {
                            handleCloseAction();
                        }
                        else
                        {
                            terrainLayers = terrainLayers.filter(id => id !== action.layerId);
                            vp.aLayers = vp.aLayers.filter((_, i) => i !== idx);
                                                    // terrainLayers.slice(idx,1/*terrainLayers.length - 1 - idx*/);
                            actualTerrain?.RemoveLayer(pLayer);
                        }
                    }
                }
                else if (action.action === 'SET_DEFAULT_CENTER_POINT') {
                    defaultCenterPoint = action.Value as MapCore.SMcVector3D;
                }
                // Handle map close
                else if (action.action === 'CLOSE_MAP') {
                    handleCloseAction();
                }
                // Handle toggle DTM visualization
                else if (action.action === 'TOGGLE_DTM') {
                    DoDtmVisualization();
                }
                else if (action.action === 'DAY_MODE') {
                    ToggleDayNightMode(true);
                }
                else if (action.action === 'NIGHT_MODE') {
                    ToggleDayNightMode(false);
                }
                else if (action.action === 'ROTATE_TO_NORTH') {
                    RotateToNorth();
                }
                else if (action.action === 'SET_CURSOR') {
                    setCursor(action.cursorType);
                }
                // Toggle map grid
                else if (action.action === 'TOGGLE_GRID') {
                    toggleGrid();
                }
                // Set a specific layer bounding box
                else if (action.action === 'LAYER_BOUNDINGBOX') {
                    TrySetLayerBox(action.layerId);
                }
                // Initiate terrain analysis 
                else if (action.action === 'ELLIPSE_GPU') {
                    DoEllipseGPU();
                }
                else if (action.action === 'REMOVE_OBJECTS') {
                    //wpContextMenuEnabled = false;
                    // setWpCtxEnabled(false);
                    closeObjects();
                }
                // else if (action.action === 'EDIT_SIMTRAIL')
                // {
                //     setWayPointsEnabled(false)
                //     DoRobotTrailObject();                    
                // }
                // else if (action.action === 'INIT_SIMTRAIL')
                // {
                //     setWayPointsEnabled(false)
                //     DoRobotTrailObject(false);
                // }
                // else if (action.action === 'REMOVE_WAYPOINTS')
                // {
                //     setWayPointsEnabled(false);
                //     DoRemoveWaypoints();
                // }
                // else if (action.action === 'PUBLISH_NAV_PATH')
                // {
                //     // DoPublishRobotTrail(action.layerId, action.frame);
                //     ToggleNavigation();
                // }
                // else if (action.action === 'PUBLISH_TRAIL')
                // {
                //     DoPublishRobotTrail(action.layerId, action.frame);
                //     setWpCtxEnabled(true);
                //     //wpContextMenuEnabled = true;
                //     lastSelectedItem = 'Toggle way-points';
                // }
                // else if (action.action === 'PUBLISH_WP_LOGBOOK')
                // {
                //     DoPublishPathDescription();
                //     setWpCtxEnabled(false);
                //     //wpContextMenuEnabled = false;
                // }
                // else if (action.action === 'MARKINGS_SUBS')
                // {
                //     DoShowMarkingSubscription();
                // }
                else if (action.action === 'SET_INITIAL_GUESS')
                {
                    DoSetInitialGuess(OBJ_INITIAL_GUESS_ID);
                }
                else if (action.action === 'SET_UTM_GOAL')
                {
                    DoSetInitialGuess(OBJ_UTM_GOAL_ID);
                }
                else if (action.action === 'toggle_CAMTRACK')
                {
                    FirstCameraTrack = action.cameraTrack;
                    isCameraTrack = action.cameraTrack;
                }
                // else if (action.action ==='MAP_SET_SELECTION')
                // {
                //     DoShowMapSelect();
                // }
                else if (action.action === 'ZOOM_IN')
                {
                    handleZoom(120);
                }
                else if (action.action === 'ZOOM_OUT')
                {
                    handleZoom(-120);

                }
                // else if (action.action === 'GPS_MODE')
                // {
                //     handleGPS();
                // }
                else if (action.action === 'MOVE_TO')
                {
                    let pos = new MapCore.SMcVector3D(action.posX, action.posY, action.posZ);
                    if (aViewports.length > 0)
                    {
                        moveTo(pos);
                    }
                }
            }
            lastAction = action;
            return true;
        }
        return false;
    }

    
    /* */
    return (
        // Canvases - the 2D and 3D canvas window
        <div ref={targetRef}  
            id='Canvases'
            className="absolute inset-0 w-full h-full"
            style={{touchAction: 'none'}} 
            onContextMenu={(e) => {
                e.preventDefault();
                console.log("RightClick detected", e.clientX, e.clientY);
                handleContextMenu(e.clientX, e.clientY, true);
            }}>


            {/* { // Modal Yes/No selector for heartbit
              !!isYesNoOpen ?
                <YesNoModal isOpen={isYesNoOpen} 
                            onNo={() => 
                                {                                    
                                    setIsYesNoOpen(false)
                                    evpsHeartBit.PublishUserChoice(false);
                                }
                            }
                            onYes={() => 
                                {
                                    setIsYesNoOpen(false)
                                    evpsHeartBit.PublishUserChoice(true);
                                }
                            }
                            message="EVPS was intialized. Do you want to upload data?"

                ></YesNoModal> : ''} */}

            {/* { // Modal Yes/No for waypoints remove confirmation
              !!wpRemoveConfirm ? Action
                <YesNoModal isOpen={wpRemoveConfirm}
                    onNo={() => {setWpRemoveConfirm(false);}}
                    onYes={() => 
                        {
                            setWpRemoveConfirm(false);
                            navcoreObjects.RemoveWaypoint(lastObjectToRemove);
                            lastObjectToRemove = null;
                        }}
                    message="Removing waypoint. Are you sure ?"
                /> : ''
            } */}

            {/* {                           
                compareAction()
            } */}
        </div>
    );
};

export { MapCoreViewer as default }
