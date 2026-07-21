import { describe, expect, it } from "vitest";
import { DomainStoryPropertiesService } from "../DomainStoryPropertiesService";
import {
    DomainPurity,
    Granularity_Grain,
    PointInTime,
} from "../../entities/scope";

describe("DomainStoryPropertiesService", () => {
    it("defaults to empty metadata before any import", () => {
        const service = new DomainStoryPropertiesService();

        expect(service.getTitle()).toBe("");
        expect(service.getDescription()).toBe("");
        expect(service.getVersion()).toBe("");
        expect(service.getScope()).toBeUndefined();
    });

    it("stores and returns the properties written on import", () => {
        const service = new DomainStoryPropertiesService();
        const scope = {
            granularity: Granularity_Grain.COARSE,
            pointInTime: PointInTime.TO_BE,
            domainPurity: DomainPurity.DIGITALIZED,
        };

        service.setProperties("Title", "Description", scope, "4.0.0");

        expect(service.getTitle()).toBe("Title");
        expect(service.getDescription()).toBe("Description");
        expect(service.getScope()).toEqual(scope);
        expect(service.getVersion()).toBe("4.0.0");
    });

    it("overwrites previous properties and can clear the scope", () => {
        const service = new DomainStoryPropertiesService();

        service.setProperties(
            "A",
            "B",
            { pointInTime: PointInTime.AS_IS },
            "1.0.0",
        );
        service.setProperties("C", "D", undefined, "4.0.0");

        expect(service.getTitle()).toBe("C");
        expect(service.getDescription()).toBe("D");
        expect(service.getVersion()).toBe("4.0.0");
        expect(service.getScope()).toBeUndefined();
    });
});
