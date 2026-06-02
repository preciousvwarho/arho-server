import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

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
}
