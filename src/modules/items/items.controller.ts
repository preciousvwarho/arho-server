import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListItemsQuery } from './dto/list-items.query';
import { ItemsService } from './items.service';

@ApiTags('items')
@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  @ApiOperation({ summary: 'List recyclable item types' })
  async list(@Query() query: ListItemsQuery) {
    return { status: 'success', data: await this.items.list(query) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a recyclable item type' })
  async get(@Param('id') id: string) {
    return { status: 'success', data: { item: await this.items.get(id) } };
  }
}
