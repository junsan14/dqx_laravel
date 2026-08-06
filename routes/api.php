<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

use App\Http\Controllers\Api\MonsterController;
use App\Http\Controllers\Api\EquipmentController;
use App\Http\Controllers\Api\OrbController;
use App\Http\Controllers\Api\ItemController;
use App\Http\Controllers\Api\MonsterLookupController;
use App\Http\Controllers\Api\AccessoryController;
use App\Http\Controllers\Api\EquipmentTypeController;
use App\Http\Controllers\Api\GameJobController;
use App\Http\Controllers\Api\MonsterMapSpawnController;
use App\Http\Controllers\Api\MapController;
use App\Http\Controllers\Api\CrystalRuleController;
use App\Http\Controllers\Api\ContinentController;
use App\Http\Controllers\Api\KishojuReportController;
use App\Http\Controllers\Api\KishojuRoomController;
use App\Http\Controllers\Api\BossController;
use App\Http\Controllers\Api\CraftTypeController;


use App\Http\Controllers\Api\UpdateItemMarketPricesController;

use App\Http\Controllers\Api\ContentReportController;

use App\Http\Controllers\Api\AdminContentReportController;
use App\Http\Controllers\Api\MonsterSystemTypeController;

use App\Http\Controllers\Api\CraftProductTypeController;

Route::Resource('/craft-product-types', CraftProductTypeController::class);


Route::middleware(['auth:sanctum'])->get('/user', function (Request $request) {
    return $request->user();
});





Route::apiResource('bosses', BossController::class);

Route::prefix('tools/weight-checker')->group(function () {
    Route::get('/bosses', [BossController::class, 'weightCheckerBosses']);
});







Route::prefix('kishoju')->group(function () {
    Route::post('/rooms', [KishojuRoomController::class, 'store']);
    Route::get('/rooms/{publicId}', [KishojuRoomController::class, 'show']);
    Route::post('/rooms/{publicId}/join', [KishojuRoomController::class, 'join']);

    Route::delete('/rooms/{publicId}/members/{memberId}', [KishojuRoomController::class, 'destroyMember']);

    Route::get('/rooms/{publicId}/reports', [KishojuReportController::class, 'index']);
    Route::post('/rooms/{publicId}/reports', [KishojuReportController::class, 'store']);
    Route::delete('/rooms/{publicId}/reports/{reportId}', [KishojuReportController::class, 'destroy']);
});

Route::get('/admin/kishoju/rooms', [KishojuRoomController::class, 'adminIndex']);
Route::get('/admin/kishoju/near-rainbow', [KishojuRoomController::class, 'adminNearRainbow']);
Route::Resource('/monster-map-spawns', MonsterMapSpawnController::class);


Route::apiResource('equipment-types', EquipmentTypeController::class);
Route::apiResource('craft-types', CraftTypeController::class);

Route::Resource('/game-jobs', GameJobController::class);

Route::put('/game-jobs/{gameJob}/equipable-types', [GameJobController::class, 'updateEquipableTypes']);


Route::Resource('crystal-rules', CrystalRuleController::class)
    ->only(['index', 'store', 'update','destroy']);
Route::Resource('/accessories', AccessoryController::class);

//Route::get('/monster-lookup', [MonsterLookupController::class, 'index']);

Route::get('/maps/options', [MapController::class, 'options']);

Route::resource('maps', MapController::class)->only([
    'index',
    'show',
    'store',
    'update',
    'destroy'
]);



Route::Resource('continents', ContinentController::class);
// 画像アップロード
Route::post('/maps/{map}/layers/upload', [MapController::class, 'uploadLayerImage']);

Route::post('/accessories/upload-image', [AccessoryController::class, 'uploadImage']);

Route::Resource('/orbs', OrbController::class);
Route::get('/items/by-ids', [ItemController::class, 'byIds']);
Route::Resource('/items', ItemController::class);

// 既存の Route::Resource('/items', ItemController::class); より前後どちらでもOK
Route::middleware('auth:sanctum')->group(function () {
    Route::post(
        '/admin/items/update-market-prices',
        UpdateItemMarketPricesController::class
    );
});


Route::Resource('/equipments', EquipmentController::class);
Route::get('/monsters/zukan', [MonsterController::class, 'zukan']);

Route::Resource('/monster-search', MonsterController::class);
Route::get('/monsters/around-display-order', [MonsterController::class, 'aroundDisplayOrder']);

Route::get('/content-reports', [ContentReportController::class, 'index'])
    ->middleware('throttle:60,1');

$contentReportThrottle = app()->environment(['local', 'testing'])
    ? 'throttle:1000,1'
    : 'throttle:5,10';

Route::post('/content-reports', [ContentReportController::class, 'store'])
    ->middleware($contentReportThrottle);


Route::get('/content-reports', [ContentReportController::class, 'index'])
    ->middleware('throttle:60,1');



Route::prefix('admin/content-reports')
    ->middleware(['auth:sanctum']) // 既存のadmin middlewareがあれば追加してください。
    ->group(function () {
        Route::get('/', [AdminContentReportController::class, 'index']);
        Route::patch('/{contentReport}', [AdminContentReportController::class, 'update']);
        Route::delete('/{contentReport}', [AdminContentReportController::class, 'destroy']);
    });
Route::get(
    '/content-reports/summary',
    [ContentReportController::class, 'summary']
)->middleware('throttle:120,1');

Route::get('/monster-system-types', [
    MonsterSystemTypeController::class,
    'index',
]);