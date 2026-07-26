<?php

namespace App\Console\Commands;

use App\Models\KishojuRoom;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class DeleteOldKishojuRooms extends Command
{
    protected $signature = 'kishoju:delete-old-rooms';

    protected $description = 'Delete Kishoju rooms that have been inactive for more than 4 hours';

    public function handle(): int
    {
        $borderTime = now()->subHours(4);

        $rooms = KishojuRoom::where('updated_at', '<=', $borderTime)->get();

        if ($rooms->isEmpty()) {
            $this->info('No old Kishoju rooms found.');
            return self::SUCCESS;
        }

        $deletedCount = 0;

        foreach ($rooms as $room) {
            DB::transaction(function () use ($room, &$deletedCount) {
                $room->reports()->delete();
                $room->members()->delete();
                $room->delete();

                $deletedCount++;
            });
        }

        $this->info("Deleted {$deletedCount} old Kishoju room(s).");

        return self::SUCCESS;
    }
}