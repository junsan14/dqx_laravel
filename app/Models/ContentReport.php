<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ContentReport extends Model
{
    protected $fillable = [
        'reportable_type',
        'reportable_id',
        'category',
        'field_key',
        'message',
        'suggested_value',
        'context_json',
        'locale',
        'status',
        'is_public',
        'submitter_token_hash',
        'ip_hash',
        'reviewed_by',
        'reviewed_at',
        'resolved_note',
    ];

    protected $casts = [
        'context_json' => 'array',
        'is_public' => 'boolean',
        'reviewed_at' => 'datetime',
    ];
}
