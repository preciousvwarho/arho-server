import { BadRequestException } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateAreaDto, UpdateAreaDto } from './dto/area.dto';
import { CreateCountryDto, UpdateCountryDto } from './dto/country.dto';
import { CreateStateDto, UpdateStateDto } from './dto/state.dto';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  listCountries() {
    return this.prisma.country.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  listStates(countryId: string) {
    return this.prisma.state.findMany({
      where: { countryId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  listAreas(stateId: string) {
    return this.prisma.area.findMany({
      where: { stateId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  getCountry(id: string) {
    return this.prisma.country.findUniqueOrThrow({ where: { id } });
  }

  createCountry(dto: CreateCountryDto) {
    return this.prisma.country.create({
      data: {
        name: dto.name,
        code: dto.code.toUpperCase(),
        currency: dto.currency.toUpperCase(),
        phoneCode: dto.phoneCode,
      },
    });
  }

  updateCountry(id: string, dto: UpdateCountryDto) {
    return this.prisma.country.update({
      where: { id },
      data: {
        ...dto,
        code: dto.code?.toUpperCase(),
        currency: dto.currency?.toUpperCase(),
      },
    });
  }

  async deleteCountry(id: string) {
    const states = await this.prisma.state.count({ where: { countryId: id } });
    if (states > 0) {
      throw new BadRequestException('Cannot delete a country that has states');
    }
    return this.prisma.country.delete({ where: { id } });
  }

  listAllStates(countryId?: string) {
    return this.prisma.state.findMany({
      where: { ...(countryId ? { countryId } : {}) },
      include: { country: true },
      orderBy: { name: 'asc' },
    });
  }

  getState(id: string) {
    return this.prisma.state.findUniqueOrThrow({
      where: { id },
      include: { country: true },
    });
  }

  createState(dto: CreateStateDto) {
    return this.prisma.state.create({
      data: {
        name: dto.name,
        code: dto.code.toUpperCase(),
        countryId: dto.countryId,
      },
      include: { country: true },
    });
  }

  updateState(id: string, dto: UpdateStateDto) {
    return this.prisma.state.update({
      where: { id },
      data: {
        ...dto,
        code: dto.code?.toUpperCase(),
      },
      include: { country: true },
    });
  }

  async deleteState(id: string) {
    const areas = await this.prisma.area.count({ where: { stateId: id } });
    if (areas > 0) {
      throw new BadRequestException(
        'Cannot delete a state that has pickup areas',
      );
    }
    return this.prisma.state.delete({ where: { id } });
  }

  listAllAreas(stateId?: string, countryId?: string) {
    return this.prisma.area.findMany({
      where: {
        ...(stateId ? { stateId } : {}),
        ...(countryId ? { countryId } : {}),
      },
      include: { state: true, country: true },
      orderBy: { name: 'asc' },
    });
  }

  getArea(id: string) {
    return this.prisma.area.findUniqueOrThrow({
      where: { id },
      include: { state: true, country: true },
    });
  }

  async createArea(dto: CreateAreaDto) {
    const state = await this.prisma.state.findUniqueOrThrow({
      where: { id: dto.stateId },
    });
    if (state.countryId !== dto.countryId) {
      throw new BadRequestException(
        'The selected state does not belong to the country',
      );
    }
    return this.prisma.area.create({
      data: {
        name: dto.name,
        code: dto.code.toUpperCase(),
        stateId: dto.stateId,
        countryId: dto.countryId,
        postalCode: dto.postalCode,
      },
      include: { state: true, country: true },
    });
  }

  updateArea(id: string, dto: UpdateAreaDto) {
    return this.prisma.area.update({
      where: { id },
      data: {
        ...dto,
        code: dto.code?.toUpperCase(),
      },
      include: { state: true, country: true },
    });
  }

  deleteArea(id: string) {
    return this.prisma.area.delete({ where: { id } });
  }
}
