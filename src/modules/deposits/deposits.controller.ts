import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../common/types/authenticated-request';
import { imageUploadOptions } from '../uploads/multer-image.options';
import { UploadsService } from '../uploads/uploads.service';
import { DepositsService } from './deposits.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { ListDepositsQuery } from './dto/list-deposits.query';

@ApiTags('deposits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('deposits')
export class DepositsController {
  constructor(
    private readonly deposits: DepositsService,
    private readonly uploads: UploadsService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('image', imageUploadOptions))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({ summary: 'Submit a recyclable item pickup request' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['itemId'],
      properties: {
        itemId: { type: 'string' },
        locationId: { type: 'string' },
        customLocation: {
          oneOf: [
            { type: 'object' },
            {
              type: 'string',
              description: 'JSON string for multipart requests',
            },
          ],
        },
        image: { type: 'string', format: 'binary' },
        imageUrl: { type: 'string' },
        imageId: { type: 'string' },
      },
    },
  })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateDepositDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (typeof dto.customLocation === 'string') {
      dto.customLocation = JSON.parse(
        dto.customLocation,
      ) as CreateDepositDto['customLocation'];
    }
    const uploadedImage = file
      ? await this.uploads.uploadImage(file.buffer, 'deposit-requests')
      : undefined;
    return {
      status: 'success',
      data: {
        deposit: await this.deposits.create(user.sub, dto, uploadedImage),
      },
    };
  }

  @Get()
  async listMine(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListDepositsQuery,
  ) {
    return {
      status: 'success',
      data: await this.deposits.listMine(user.sub, query),
    };
  }

  @Get('stats')
  async stats(@CurrentUser() user: JwtPayload) {
    return { status: 'success', data: await this.deposits.getStats(user.sub) };
  }

  @Get(':id')
  async getMine(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return {
      status: 'success',
      data: { deposit: await this.deposits.getMine(user.sub, id) },
    };
  }
}
