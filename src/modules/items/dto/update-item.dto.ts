import { PartialType } from '@nestjs/swagger';
import { CreateItemDto } from '../../admins/dto/create-item.dto';

export class UpdateItemDto extends PartialType(CreateItemDto) {}
