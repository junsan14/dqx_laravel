<?php

namespace App\Http\Controllers\Api;

use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Intervention\Image\Drivers\Gd\Driver;
use Intervention\Image\Encoders\WebpEncoder;
use Intervention\Image\ImageManager;

class MapController extends Controller
{
    public function index(Request $request)
    {
        $keyword = trim((string) $request->get('q', ''));

        $query = DB::table('maps')
            ->leftJoin('continents', 'continents.id', '=', 'maps.continent_id')
            ->select(
                'maps.id',
                'maps.continent_id',
                'continents.display_order as continent_display_order',
                'continents.name as continent',
                'continents.name_en as continent_name_en',
                'continents.map_image_folder as continent_folder',
                'maps.name',
                'maps.name_kana',
                'maps.name_en',
                'maps.map_type',
                'maps.source_url',
                'maps.created_at',
                'maps.updated_at'
            )
            ->orderBy('continents.display_order', 'asc')
            ->orderBy('maps.id', 'asc');

        if ($keyword !== '') {
            $query->where(function ($sub) use ($keyword) {
                $sub->where('maps.name', 'like', "%{$keyword}%")
                    ->orWhere('maps.name_kana', 'like', "%{$keyword}%")
                    ->orWhere('maps.name_en', 'like', "%{$keyword}%")
                    ->orWhere('continents.name', 'like', "%{$keyword}%")
                    ->orWhere('continents.name_en', 'like', "%{$keyword}%")
                    ->orWhere('maps.map_type', 'like', "%{$keyword}%");
            });
        }

        $rows = $query->get();
        $mapIds = $rows->pluck('id')->filter()->values();

        $layersByMapId = collect();

        if ($mapIds->isNotEmpty()) {
            $layers = DB::table('map_layers')
                ->select(
                    'id',
                    'map_id',
                    'layer_name',
                    'floor_no',
                    'image_path',
                    'source_url',
                    'display_order',
                    'created_at',
                    'updated_at'
                )
                ->whereIn('map_id', $mapIds)
                ->orderBy('map_id', 'asc')
                ->orderBy('display_order', 'asc')
                ->orderBy('floor_no', 'asc')
                ->orderBy('id', 'asc')
                ->get();

            $layersByMapId = $layers->groupBy('map_id');
        }

        $data = $rows->map(function ($row) use ($layersByMapId) {
            return [
                'id' => $row->id,
                'continent_id' => $row->continent_id ? (int) $row->continent_id : null,
                'continent_display_order' => $row->continent_display_order ? (int) $row->continent_display_order : null,
                'continent' => $row->continent,
                'continent_name' => $row->continent,
                'continent_name_en' => $row->continent_name_en,
                'continent_folder' => $row->continent_folder,
                'name' => $row->name,
                'name_kana' => $row->name_kana,
                'name_en' => $row->name_en,
                'map_type' => $row->map_type,
                'source_url' => $row->source_url,
                'created_at' => $row->created_at,
                'updated_at' => $row->updated_at,
                'layers' => ($layersByMapId->get($row->id) ?? collect())->values(),
            ];
        });

        return response()->json([
            'data' => $data,
        ]);
    }

    public function show(string $id)
    {
        $row = DB::table('maps')
            ->leftJoin('continents', 'continents.id', '=', 'maps.continent_id')
            ->select(
                'maps.id',
                'maps.continent_id',
                'continents.display_order as continent_display_order',
                'continents.name as continent',
                'continents.name_en as continent_name_en',
                'continents.map_image_folder as continent_folder',
                'maps.name',
                'maps.name_kana',
                'maps.name_en',
                'maps.map_type',
                'maps.source_url',
                'maps.created_at',
                'maps.updated_at'
            )
            ->where('maps.id', $id)
            ->first();

        if (!$row) {
            return response()->json([
                'message' => 'マップが見つからない',
            ], 404);
        }

        $layers = $this->getLayersByMapId($row->id);

        return response()->json([
            'data' => [
                'id' => $row->id,
                'continent_id' => $row->continent_id ? (int) $row->continent_id : null,
                'continent_display_order' => $row->continent_display_order ? (int) $row->continent_display_order : null,
                'continent' => $row->continent,
                'continent_name' => $row->continent,
                'continent_name_en' => $row->continent_name_en,
                'continent_folder' => $row->continent_folder,
                'name' => $row->name,
                'name_kana' => $row->name_kana,
                'name_en' => $row->name_en,
                'map_type' => $row->map_type,
                'source_url' => $row->source_url,
                'created_at' => $row->created_at,
                'updated_at' => $row->updated_at,
                'layers' => $layers,
            ],
        ]);
    }

    public function store(Request $request)
    {
        $data = $this->validateMapRequest($request, false);
        $layers = $this->extractLayers($request);

        $mapId = DB::transaction(function () use ($request, $data, $layers) {
            $mapId = DB::table('maps')->insertGetId([
                'continent_id' => $data['continent_id'],
                'name' => $data['name'],
                'name_kana' => $this->nullableString($data['name_kana'] ?? null),
                'name_en' => $this->nullableString($data['name_en'] ?? null),
                'map_type' => $data['map_type'],
                'source_url' => $this->nullableString($data['source_url'] ?? null),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $this->syncLayers($request, $mapId, $layers, [
                'continent_folder' => $data['continent_folder'],
            ]);

            return $mapId;
        });

        return $this->show((string) $mapId);
    }

    public function update(Request $request, string $id)
    {
        $row = DB::table('maps')
            ->leftJoin('continents', 'continents.id', '=', 'maps.continent_id')
            ->select(
                'maps.id',
                'maps.continent_id',
                'continents.name as continent_name'
            )
            ->where('maps.id', $id)
            ->first();

        if (!$row) {
            return response()->json([
                'message' => 'マップが見つからない',
            ], 404);
        }

        $data = $this->validateMapRequest($request, true);
        $layers = $this->extractLayers($request);

        DB::transaction(function () use ($request, $id, $row, $data, $layers) {
            $updateData = [
                'updated_at' => now(),
            ];

            if (array_key_exists('continent_id', $data)) {
                $updateData['continent_id'] = $data['continent_id'];
            }

            if (array_key_exists('name', $data)) {
                $updateData['name'] = $data['name'];
            }

            if (array_key_exists('name_kana', $data)) {
                $updateData['name_kana'] = $this->nullableString($data['name_kana']);
            }

            if (array_key_exists('name_en', $data)) {
                $updateData['name_en'] = $this->nullableString($data['name_en']);
            }

            if (array_key_exists('map_type', $data)) {
                $updateData['map_type'] = $data['map_type'];
            }

            if (array_key_exists('source_url', $data)) {
                $updateData['source_url'] = $this->nullableString($data['source_url']);
            }

            DB::table('maps')
                ->where('id', $id)
                ->update($updateData);

            if ($this->requestHasLayers($request)) {
                $continentFolder = $data['continent_folder'] ?? null;

                if ($continentFolder === null || trim((string) $continentFolder) === '') {
                    throw new \InvalidArgumentException('layers を更新する場合は continent_folder が必要');
                }

                $this->syncLayers($request, (int) $id, $layers, [
                    'continent_folder' => $continentFolder,
                ]);
            }
        });

        return $this->show($id);
    }

    public function destroy(string $id)
    {
        $exists = DB::table('maps')->where('id', $id)->exists();

        if (!$exists) {
            return response()->json([
                'message' => 'マップが見つからない',
            ], 404);
        }

        DB::transaction(function () use ($id) {
            $layers = DB::table('map_layers')
                ->select('image_path')
                ->where('map_id', $id)
                ->get();

            foreach ($layers as $layer) {
                $this->deleteImageIfExists($layer->image_path);
            }

            DB::table('map_layers')->where('map_id', $id)->delete();
            DB::table('maps')->where('id', $id)->delete();
        });

        return response()->json([
            'success' => true,
        ]);
    }

    public function options()
    {
        $continents = DB::table('continents')
            ->select('id', 'display_order', 'name', 'name_kana', 'name_en', 'map_image_folder')
            ->orderBy('display_order', 'asc')
            ->orderBy('id', 'asc')
            ->get()
            ->map(function ($row) {
                return [
                    'id' => (int) $row->id,
                    'display_order' => (int) $row->display_order,
                    'name' => $row->name,
                    'name_kana' => $row->name_kana,
                    'name_en' => $row->name_en,
                    'map_image_folder' => $row->map_image_folder,
                    'continent_folder' => $row->map_image_folder,
                    'folder' => $row->map_image_folder,
                ];
            })
            ->values();

        $mapTypes = DB::table('maps')
            ->whereNotNull('map_type')
            ->where('map_type', '<>', '')
            ->distinct()
            ->orderBy('map_type', 'asc')
            ->pluck('map_type')
            ->values();

        return response()->json([
            'data' => [
                'continents' => $continents,
                'map_types' => $mapTypes,
            ],
        ]);
    }

    private function validateMapRequest(Request $request, bool $isUpdate = false): array
    {
        return $request->validate([
            'continent_id' => $isUpdate
                ? ['sometimes', 'required', 'integer', 'exists:continents,id']
                : ['required', 'integer', 'exists:continents,id'],
            'continent_folder' => $isUpdate
                ? ['sometimes', 'required', 'string', 'max:255']
                : ['required', 'string', 'max:255'],
            'name' => $isUpdate
                ? ['sometimes', 'required', 'string', 'max:255']
                : ['required', 'string', 'max:255'],
            'name_kana' => ['nullable', 'string', 'max:255'],
            'name_en' => ['nullable', 'string', 'max:255'],
            'map_type' => $isUpdate
                ? ['sometimes', 'required', 'string', 'max:255']
                : ['required', 'string', 'max:255'],
            'source_url' => ['nullable', 'string', 'max:255'],
            'layers' => ['nullable'],
        ]);
    }

    private function extractLayers(Request $request): array
    {
        $layers = $request->input('layers', []);

        if (is_string($layers)) {
            $decoded = json_decode($layers, true);
            $layers = is_array($decoded) ? $decoded : [];
        }

        if (!is_array($layers)) {
            return [];
        }

        return array_values(array_map(function ($layer, $index) {
            $layer = is_array($layer) ? $layer : [];

            return [
                'id' => isset($layer['id']) && $layer['id'] !== '' ? (int) $layer['id'] : null,
                'layer_name' => $this->nullableString($layer['layer_name'] ?? null),
                'layer_file_name' => $this->sanitizeLayerFileName($layer['layer_file_name'] ?? null),
                'floor_no' => isset($layer['floor_no']) && $layer['floor_no'] !== ''
                    ? (int) $layer['floor_no']
                    : 0,
                'source_url' => $this->nullableString($layer['source_url'] ?? null),
                'display_order' => isset($layer['display_order']) && $layer['display_order'] !== ''
                    ? max(1, (int) $layer['display_order'])
                    : ($index + 1),
            ];
        }, $layers, array_keys($layers)));
    }

    private function requestHasLayers(Request $request): bool
    {
        return $request->has('layers') || data_get($request->allFiles(), 'layers') !== null;
    }

    private function getLayersByMapId(int|string $mapId)
    {
        return DB::table('map_layers')
            ->select(
                'id',
                'map_id',
                'layer_name',
                'floor_no',
                'image_path',
                'source_url',
                'display_order',
                'created_at',
                'updated_at'
            )
            ->where('map_id', $mapId)
            ->orderBy('display_order', 'asc')
            ->orderBy('floor_no', 'asc')
            ->orderBy('id', 'asc')
            ->get();
    }

    private function syncLayers(Request $request, int|string $mapId, array $layers, array $mapData): void
    {
        $existingIds = DB::table('map_layers')
            ->where('map_id', $mapId)
            ->pluck('id')
            ->map(fn ($value) => (int) $value)
            ->all();

        $keptIds = [];

        foreach ($layers as $index => $layer) {
            $layerId = $layer['id'] ?? null;
            $floorNo = (int) ($layer['floor_no'] ?? 0);
            $layerName = $this->nullableString($layer['layer_name'] ?? null);
            $layerFileName = $this->sanitizeLayerFileName($layer['layer_file_name'] ?? null);

            $payload = [
                'map_id' => $mapId,
                'layer_name' => $layerName,
                'floor_no' => $floorNo,
                'source_url' => $this->nullableString($layer['source_url'] ?? null),
                'display_order' => max(1, (int) ($layer['display_order'] ?? ($index + 1))),
                'updated_at' => now(),
            ];

            /** @var UploadedFile|null $uploadedFile */
            $uploadedFile = data_get($request->allFiles(), "layers.$index.image");

            if (!$uploadedFile instanceof UploadedFile) {
                $uploadedFile = data_get($request->allFiles(), "layers.$index.image_file");
            }

            if ($uploadedFile instanceof UploadedFile && $layerFileName === '') {
                throw new \InvalidArgumentException("layers.{$index}.layer_file_name is required");
            }

            if ($layerId && in_array($layerId, $existingIds, true)) {
                $oldLayer = DB::table('map_layers')
                    ->select('image_path')
                    ->where('id', $layerId)
                    ->where('map_id', $mapId)
                    ->first();

                $payload['image_path'] = $oldLayer?->image_path;

                if ($uploadedFile instanceof UploadedFile) {
                    $newImagePath = $this->storeLayerImage(
                        $uploadedFile,
                        $mapId,
                        $mapData['continent_folder'],
                        $layerFileName
                    );

                    if (!empty($oldLayer?->image_path) && $oldLayer->image_path !== $newImagePath) {
                        $this->deleteImageIfExists($oldLayer->image_path);
                    }

                    $payload['image_path'] = $newImagePath;
                }

                DB::table('map_layers')
                    ->where('id', $layerId)
                    ->where('map_id', $mapId)
                    ->update($payload);

                $keptIds[] = $layerId;
                continue;
            }

            if ($uploadedFile instanceof UploadedFile) {
                $payload['image_path'] = $this->storeLayerImage(
                    $uploadedFile,
                    $mapId,
                    $mapData['continent_folder'],
                    $layerFileName
                );
            } else {
                $payload['image_path'] = null;
            }

            $newId = DB::table('map_layers')->insertGetId([
                ...$payload,
                'created_at' => now(),
            ]);

            $keptIds[] = (int) $newId;
        }

        $deleteIds = array_values(array_diff($existingIds, $keptIds));

        if (!empty($deleteIds)) {
            $deleteLayers = DB::table('map_layers')
                ->select('image_path')
                ->where('map_id', $mapId)
                ->whereIn('id', $deleteIds)
                ->get();

            foreach ($deleteLayers as $deleteLayer) {
                $this->deleteImageIfExists($deleteLayer->image_path);
            }

            DB::table('map_layers')
                ->where('map_id', $mapId)
                ->whereIn('id', $deleteIds)
                ->delete();
        }
    }

    private function storeLayerImage(
        UploadedFile $file,
        int|string $mapId,
        string $continentFolder,
        string $layerFileName
    ): string {
        $continentFolder = $this->sanitizePathSegment($continentFolder);

        if ($continentFolder === '') {
            throw new \InvalidArgumentException('continent_folder is required');
        }

        $safeLayerFileName = $this->sanitizeLayerFileName($layerFileName);

        if ($safeLayerFileName === '') {
            throw new \InvalidArgumentException('layer_file_name is required');
        }

        $folder = "images/maps/{$continentFolder}/map_id_{$mapId}";
        $fileName = "{$safeLayerFileName}.webp";
        $storagePath = "{$folder}/{$fileName}";

        $manager = new ImageManager(new Driver());
        $image = $manager->read($file->getPathname());

        $width = $image->width();
        $height = $image->height();

        $cropWidth = 490;
        $cropHeight = 565;
        $offsetX = 35;
        $offsetY = 25;

        $canCrop = $width >= ($offsetX + $cropWidth) && $height >= ($offsetY + $cropHeight);

        if ($canCrop) {
            $image->crop($cropWidth, $cropHeight, $offsetX, $offsetY);
            $image->sharpen(15);
        } else {
            $maxWidth = 700;
            $maxHeight = 700;

            if ($width > $maxWidth || $height > $maxHeight) {
                $image->scaleDown($maxWidth, $maxHeight);
            }

            $image->sharpen(8);
        }

        $encoded = $image->encode(new WebpEncoder(quality: 65));

        Storage::disk('public')->put($storagePath, (string) $encoded);

        return '/storage/' . $storagePath;
    }

    private function deleteImageIfExists(?string $publicPath): void
    {
        $publicPath = trim((string) $publicPath);

        if ($publicPath === '') {
            return;
        }

        $storagePath = preg_replace('#^/storage/#', '', $publicPath);

        if ($storagePath && Storage::disk('public')->exists($storagePath)) {
            Storage::disk('public')->delete($storagePath);
        }
    }

    private function sanitizePathSegment(?string $value): string
    {
        $value = trim((string) $value);
        $value = preg_replace('/[^A-Za-z0-9_\-]/', '', $value ?? '');

        return trim((string) $value);
    }

    private function sanitizeLayerFileName(?string $value): string
    {
        $value = trim((string) $value);

        if ($value === '') {
            return '';
        }

        $value = preg_replace('/\s+/', '', $value);
        $value = preg_replace('/[^A-Za-z0-9_\-]/', '', $value ?? '');

        return trim((string) $value);
    }

    private function toContinentFolder(?string $value): string
    {
        return $this->sanitizePathSegment($value);
    }

    private function nullableString($value): ?string
    {
        $value = trim((string) ($value ?? ''));
        return $value === '' ? null : $value;
    }
}